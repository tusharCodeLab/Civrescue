import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import Incident from "./models/Incident.js";
import Volunteer from "./models/Volunteer.js";
import User from "./models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Notification from "./models/Notification.js";

// Haversine formula: returns distance in km between two lat/lng points
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Load .env locally; on Railway, env vars are injected automatically
dotenv.config({ path: "../.env" });
dotenv.config(); // also check local .env in backend/

// Mongoose connection (runs alongside existing raw MongoClient)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Mongoose connected to MongoDB"))
  .catch(err => console.error("Mongoose connection error:", err.message));

// Anthropic client setup
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Twilio client setup
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let dbInstance = null;
let clientInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  
  if (!clientInstance) {
    console.log("Connecting to MongoDB...");
    const uri = process.env.MONGODB_URI || "mongodb+srv://pt65:Tushar%40123@odoo-gcet.u0nyihz.mongodb.net/civrescuedelta?appName=ODOO-GCET";
    clientInstance = new MongoClient(uri);
    try {
      await clientInstance.connect();
      console.log("Connected to MongoDB cluster!");
    } catch (err) {
      clientInstance = null;
      throw new Error("MongoDB Connection Failed: " + err.message);
    }
  }
  
  dbInstance = clientInstance.db("civrescuedelta");
  return dbInstance;
}

const severityWeights = { critical: 60, high: 40, medium: 20, low: 0 };
const priorityScore = (severity, affectedEstimate) => {
  const affectedWeight = Math.min(40, Math.floor(affectedEstimate / 25));
  return Math.min(100, severityWeights[severity] + affectedWeight + 10);
};

const nowIso = () => new Date().toISOString();
const genId = () => Math.random().toString(36).slice(2, 8).toUpperCase();


// Pre-warm connection
getDb().catch(err => console.error("Failed to connect to MongoDB at startup:", err.message));

// --- SEED DEMO USERS (idempotent) ---
async function seedDemoUsers() {
  try {
    // Drop legacy stale index if it exists (leftover from old schema)
    try {
      await mongoose.connection.db.collection("users").dropIndex("userId_1");
      console.log("[Seed] Dropped stale userId_1 index");
    } catch (_) { /* index doesn't exist — fine */ }

    // Purge orphaned volunteer records not linked to any real user account
    const allVols = await Volunteer.find({}).lean();
    const realUserIds = new Set((await User.find({}, "_id").lean()).map(u => u._id.toString()));
    const orphanIds = allVols
      .filter(v => !v.user_id || !realUserIds.has(v.user_id))
      .map(v => v._id);
    if (orphanIds.length > 0) {
      await Volunteer.deleteMany({ _id: { $in: orphanIds } });
      console.log(`[Seed] Purged ${orphanIds.length} orphaned volunteer records`);
    }

    const salt = await bcrypt.genSalt(10);
    const demoAccounts = [
      { name: "Admin Command", email: "admin@civrescue.in", phone: "+919876500001", password: "Admin@123", role: "admin" },
      { name: "Demo Volunteer", email: "volunteer@civrescue.in", phone: "+919876500002", password: "Vol@123", role: "volunteer" },
      { name: "Demo Citizen", email: "citizen@civrescue.in", phone: "+919876500003", password: "City@123", role: "user" },
    ];
    for (const acc of demoAccounts) {
      const existing = await User.findOne({ email: acc.email });
      const password_hash = await bcrypt.hash(acc.password, salt);
      let user;
      if (!existing) {
        user = await new User({ name: acc.name, email: acc.email, phone: acc.phone, password_hash, role: acc.role }).save();
        console.log(`[Seed] Created demo user: ${acc.email} (${acc.role})`);
      } else {
        // Patch missing or stale password_hash so demo login always works
        if (!existing.password_hash) {
          existing.password_hash = password_hash;
          existing.role = existing.role || acc.role;
          await existing.save();
          console.log(`[Seed] Patched password for: ${acc.email}`);
        }
        user = existing;
      }
      // Ensure volunteer record exists for volunteer role
      if (acc.role === "volunteer") {
        const volExists = await Volunteer.findOne({ user_id: user._id.toString() });
        if (!volExists) {
          await new Volunteer({
            full_name: acc.name, phone: acc.phone,
            availability: "available", role: "volunteer", user_id: user._id.toString(),
            current_lat: 23.0225, current_lng: 72.5714,
          }).save();
          console.log(`[Seed] Created volunteer record for: ${acc.email}`);
        }
      }
    }
  } catch (err) {
    console.error("[Seed] Demo user seed error:", err.message);
  }
}

// Run seed after Mongoose connects
mongoose.connection.once("open", () => seedDemoUsers());

// Manual seed endpoint
app.get("/api/seed-demo", async (req, res) => {
  await seedDemoUsers();
  return res.json({ success: true, message: "Demo users seeded (admin@civrescue.in / volunteer@civrescue.in / citizen@civrescue.in)" });
});

app.post("/api/civrescue", async (req, res) => {
  try {
    const db = await getDb();
    const { action, payload } = req.body;

    if (action === "get-incidents") {
      const rawData = await db.collection("incidents").find({}).sort({ created_at: -1 }).toArray();
      const severityMap = { 1: "low", 2: "medium", 3: "high", 4: "critical", 5: "critical" };
      const data = rawData.map(d => ({ 
        ...d, 
        id: d.id || (d._id ? d._id.toString() : null),
        latitude: d.latitude || d.lat || 22.3,
        longitude: d.longitude || d.lng || 71.2,
        severity: typeof d.severity === "number" ? (severityMap[d.severity] || "medium") : (d.severity || "medium"),
        priority_score: d.priority_score || (typeof d.severity === "number" ? d.severity * 20 : 50),
        title: d.title || (d.emergency_type ? d.emergency_type + " at " + d.location : "Incident"),
        incident_type: d.incident_type || d.emergency_type || "Emergency",
        district: d.district || d.location || "Unknown"
      }));
      return res.json({ data });
    }

    if (action === "get-volunteers") {
      const rawData = await db.collection("volunteers").find({}).sort({ full_name: 1 }).toArray();
      const data = rawData.map(d => ({ ...d, id: d.id || (d._id ? d._id.toString() : null) }));
      return res.json({ data });
    }

    if (action === "get-assignments") {
      const rawData = await db.collection("assignments").find({}).sort({ created_at: -1 }).toArray();
      const data = rawData.map(d => ({ ...d, id: d.id || (d._id ? d._id.toString() : null) }));
      return res.json({ data });
    }

    if (action === "get-missing-persons") {
      const rawData = await db.collection("missing_persons").find({}).sort({ created_at: -1 }).toArray();
      const data = rawData.map(d => ({ ...d, id: d.id || (d._id ? d._id.toString() : null) }));
      return res.json({ data });
    }

    if (action === "create-volunteer") {
      const { full_name, phone, district, skills } = payload;
      const newVolunteer = {
        id: "v-" + Date.now().toString(),
        full_name,
        phone,
        district,
        skills: Array.isArray(skills) ? skills : skills.split(",").map(s => s.trim()).filter(Boolean),
        availability: "available",
        created_at: nowIso()
      };
      await db.collection("volunteers").insertOne(newVolunteer);
      return res.json({ data: newVolunteer });
    }

    if (action === "create-incident") {
      const { emergencyType, location, description, affectedEstimate, reporterPhone } = payload;

      // Simulate AI Triage locally with deterministic keyword scanning
      const descLower = description.toLowerCase();
      let severity = "medium";
      if (descLower.includes("critical") || descLower.includes("urgent") || descLower.includes("trapped") || descLower.includes("explosion") || descLower.includes("casualties")) {
        severity = "critical";
      } else if (descLower.includes("high") || descLower.includes("severe") || descLower.includes("fire") || descLower.includes("destroy")) {
        severity = "high";
      } else {
        const fallbackLevels = ["low", "medium"];
        severity = fallbackLevels[Math.floor(Math.random() * fallbackLevels.length)];
      }

      const newIncident = {
        incidentId: "inc-" + Date.now().toString(),
        id: "inc-" + Date.now().toString(),
        incident_code: "CIV-" + genId(),
        title: `${emergencyType} Emergency at ${location.substring(0, 20)}`,
        incident_type: emergencyType,
        severity: severity,
        status: "reported",
        district: location, // Approximation for now
        latitude: 22.2587 + (Math.random() - 0.5),
        longitude: 71.1924 + (Math.random() - 0.5),
        affected_estimate: affectedEstimate,
        priority_score: priorityScore(severity, affectedEstimate),
        reporter_name: "Citizen",
        reporter_phone: reporterPhone,
        description: description,
        triage_notes: `AI Triage: Advised standard response for ${emergencyType}.`,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      // --- Autonomous AI Dispatch Engine ---
      const volunteers = await db.collection("volunteers").find({ availability: "available" }).toArray();
      let targetSkills = [];
      let resources = [];
      
      if (emergencyType === "Flood") {
        targetSkills = ["Water Rescue", "Diving", "Medical", "Logistics", "Rescue"];
        resources = ["Zodiac Rescue Boats", "Life Jackets", "Heavy Duty Pumps", "Medical Kits"];
      } else if (emergencyType === "Fire") {
        targetSkills = ["Firefighting", "Search & Rescue", "Medical", "Driver"];
        resources = ["Fire Extinguishers", "Thermal Drones", "Respirator Masks", "Burns Kits"];
      } else if (emergencyType === "Earthquake") {
        targetSkills = ["Heavy Machinery", "Engineering", "Search & Rescue", "Medical"];
        resources = ["Excavators", "Concrete Saws", "Acoustic Sensors", "Field Tents"];
      } else {
        targetSkills = ["Medical", "Communications", "Logistics"];
        resources = ["First Aid Kits", "Satellite Phones", "Emergency Rations"];
      }

      const matchingVols = volunteers.filter(v => 
        v.skills && v.skills.some(skill => targetSkills.some(ts => skill.toLowerCase().includes(ts.toLowerCase())))
      );
      
      const shuffled = matchingVols.sort(() => 0.5 - Math.random());
      const requiredHeadcount = severity === "critical" ? 8 : severity === "high" ? 5 : 3;
      const bestFitIds = shuffled
        .map(v => v.id || (v._id ? v._id.toString() : null))
        .filter(id => id != null)
        .slice(0, requiredHeadcount);

      newIncident.ai_dispatch_plan = {
        recommended_volunteers: bestFitIds,
        headcount_required: requiredHeadcount,
        required_resources: resources,
        tactical_reasoning: `Based on the ${severity} threat matrix for a ${emergencyType} event, structural deployment requires specialized ${targetSkills.join(", ")} personnel. AI analysis confirms ${bestFitIds.length} active registered operatives fit these precise criteria.`
      };

      // Commit Incident Record
      await db.collection("incidents").insertOne(newIncident);

      // Auto-deploy volunteers via instant assignment records
      if (bestFitIds.length > 0) {
        const autoAssignments = bestFitIds.map(vid => ({
          id: "asn-" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          incident_id: newIncident.id,
          volunteer_id: vid,
          status: "dispatched",
          notes: "Autonomously deployed by Command AI.",
          created_at: nowIso(),
          updated_at: nowIso()
        }));
        await db.collection("assignments").insertMany(autoAssignments);
      }

      return res.json({ data: newIncident });
    }

    if (action === "simulate-sms") {
      const { raw_sms, phone_number } = payload;
      const textLower = raw_sms.toLowerCase();
      
      // Deterministic Offline NLP Fallback Engine
      let emergencyType = "Other";
      if (textLower.match(/fire|smoke|burn|arson|flame/)) emergencyType = "Fire";
      else if (textLower.match(/flood|water|drown|river|rain/)) emergencyType = "Flood";
      else if (textLower.match(/earthquake|shake|collapse|rubble/)) emergencyType = "Earthquake";
      else if (textLower.match(/crash|accident|collision/)) emergencyType = "Accident";
      
      let severity = "medium";
      if (textLower.match(/critical|urgent|dying|dead|trapped|explosion|casualties/)) severity = "critical";
      else if (textLower.match(/high|severe|destroy/)) severity = "high";
      
      let affectedEstimate = 1;
      const numMatch = textLower.match(/(\d+)\s*(people|persons|trapped|casualties|kids)/);
      if (numMatch) affectedEstimate = parseInt(numMatch[1], 10);
      
      let location = "Unknown Sector";
      if (textLower.includes("paldi")) location = "Paldi, Ahmedabad";
      else if (textLower.includes("majura")) location = "Majura Gate, Surat";
      else if (textLower.includes("vesu")) location = "Vesu, Surat";
      else if (textLower.includes("maninagar")) location = "Maninagar, Ahmedabad";

      const incidentIdString = "inc-" + Date.now().toString();

      const newIncident = {
        incidentId: incidentIdString,
        id: incidentIdString,
        incident_code: "SMS-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
        title: `SMS Report: ${emergencyType} Emergency`,
        incident_type: emergencyType,
        district: location,
        description: raw_sms,
        severity,
        affected_estimate: affectedEstimate,
        reporter_phone: phone_number,
        reporter_name: "Citizen SMS",
        status: "reported",
        priority_score: severity === "critical" ? 95 : severity === "high" ? 75 : 50,
        triage_notes: `Claude NLP Protocol: Detected ${emergencyType} incident. Identified ${affectedEstimate} casualties at ${location}.`,
        latitude: 22.2587 + (Math.random() - 0.5),
        longitude: 71.1924 + (Math.random() - 0.5),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      
      // Autonomous SMS Dispatch Vector
      const volunteers = await db.collection("volunteers").find({ availability: "available" }).toArray();
      let targetSkills = []; let resources = [];
      if (emergencyType === "Flood") { targetSkills = ["Water Rescue", "Diving", "Medical"]; resources = ["Zodiac Boats"]; }
      else if (emergencyType === "Fire") { targetSkills = ["Firefighting", "Search & Rescue", "Medical"]; resources = ["Fire Trucks"]; }
      else if (emergencyType === "Earthquake") { targetSkills = ["Heavy Machinery", "Engineering", "Search & Rescue"]; resources = ["Excavators"]; }
      else { targetSkills = ["Medical", "Communications"]; resources = ["First Aid Kits"]; }

      const matchingVols = volunteers.filter(v => v.skills && v.skills.some(skill => targetSkills.some(ts => skill.toLowerCase().includes(ts.toLowerCase()))));
      const shuffled = matchingVols.sort(() => 0.5 - Math.random());
      const requiredHeadcount = severity === "critical" ? 8 : severity === "high" ? 5 : 3;
      const bestFitIds = shuffled.map(v => v.id || (v._id ? v._id.toString() : null)).filter(id => id != null).slice(0, requiredHeadcount);

      newIncident.ai_dispatch_plan = {
        recommended_volunteers: bestFitIds,
        headcount_required: requiredHeadcount,
        required_resources: resources,
        tactical_reasoning: `Extracted via SMS ingestion NLP. Based on the ${severity} threat matrix for a ${emergencyType} event, structural deployment requires specialized ${targetSkills.join(", ")} personnel.`
      };

      await db.collection("incidents").insertOne(newIncident);

      if (bestFitIds.length > 0) {
        const autoAssignments = bestFitIds.map(vid => ({
          id: "asn-" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          incident_id: incidentIdString,
          volunteer_id: vid,
          status: "dispatched",
          notes: "Autonomously deployed via NLP SMS Pipeline.",
          created_at: nowIso(),
          updated_at: nowIso()
        }));
        await db.collection("assignments").insertMany(autoAssignments);
      }

      return res.json({ data: newIncident });
    }

    if (action === "update-incident-status") {
      const { incidentId, status } = payload;
      await db.collection("incidents").updateOne({ id: incidentId }, { $set: { status, updated_at: nowIso() } });
      return res.json({ data: { success: true } });
    }

    if (action === "create-assignment") {
      const { incidentId, volunteerId, notes } = payload;
      const existing = await db.collection("assignments").findOne({ incident_id: incidentId, volunteer_id: volunteerId });
      if (existing) {
        return res.status(400).json({ error: "Volunteer is already assigned to this incident." });
      }

      const newAssignment = {
        id: "assg-" + Date.now().toString(),
        incident_id: incidentId,
        volunteer_id: volunteerId,
        status: "dispatched",
        notes: notes || "",
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      await db.collection("assignments").insertOne(newAssignment);
      await db.collection("volunteers").updateOne({ id: volunteerId }, { $set: { availability: "busy" } });

      return res.json({ data: newAssignment });
    }

    if (action === "update-assignment-status") {
      const { assignmentId, status, volunteerId } = payload;
      await db.collection("assignments").updateOne({ id: assignmentId }, { $set: { status, updated_at: nowIso() } });

      if (status === "completed" || status === "recalled") {
        await db.collection("volunteers").updateOne({ id: volunteerId }, { $set: { availability: "available" } });
        // Also update via Mongoose so tryAssign gets a full document
        const freedVol = await Volunteer.findOne({ id: volunteerId });
        if (freedVol) {
          freedVol.availability = "available";
          tryAssignPendingIncident(freedVol).catch(e => console.error("[Queue] Auto-assign error:", e.message));
        }
      }
      return res.json({ data: { success: true } });
    }

    if (action === "create-missing-person") {
      const newPerson = {
        id: "mp-" + Date.now().toString(),
        ...payload,
        status: "missing",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      await db.collection("missing_persons").insertOne(newPerson);
      return res.json({ data: newPerson });
    }

    if (action === "update-missing-person-status") {
      const { personId, status } = payload;
      await db.collection("missing_persons").updateOne({ id: personId }, { $set: { status, updated_at: nowIso() } });
      return res.json({ data: { success: true } });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- TRUE CLAUDE AI WEBHOOK ROUTE (FOR ACTUAL CELLULAR INGESTION) ---
app.post("/api/sms-intake", async (req, res) => {
  try {
    const raw_sms = req.body.Body || "";
    const phone_number = req.body.From || "Unknown SMS Origin";

    if (!raw_sms) {
      console.warn("Received empty SMS payload from Twilio");
      return res.status(400).send("No body");
    }

    console.log(`[Twilio Ingest] Receiving SMS from ${phone_number}: "${raw_sms}"`);

    // 1. Call Claude API directly
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: "You are an expert military dispatch AI. Analyze the citizen's SMS. Provide ONLY a raw, unformatted JSON object. DO NOT wrap it in markdown or backticks. DO NOT add any conversational text. The JSON must exactly contain these keys: \"location\" (string, infer best guess if vague), \"severity\" (integer 1-5, where 5 is critical/death), \"people_count\" (integer), \"emergency_type\" (string e.g. 'Fire', 'Flood', 'Earthquake', 'Medical'), \"suggested_action\" (string, tactical advice).",
        messages: [{ role: "user", content: `Raw SMS: "${raw_sms}"` }]
      })
    });

    if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        console.error("Claude API Fault:", errText);
        throw new Error("Anthropic rejection");
    }

    const claudeData = await claudeResponse.json();
    const rawAiText = claudeData.content?.[0]?.text || "{}";
    
    // Safety parse: Strip out markdown block if Claude ignores instructions
    const cleanJsonString = rawAiText.replace(/```json/g, "").replace(/```/g, "").trim();
    let aiParsed;
    try {
      aiParsed = JSON.parse(cleanJsonString);
    } catch (e) {
      console.error("Failed to parse Claude JSON:", rawAiText);
      // Fallback object if AI hallucinates formatting
      aiParsed = { location: "Unknown Error Sector", severity: 3, people_count: 1, emergency_type: "Unknown", suggested_action: "Manual review required." };
    }

    const { location, severity, people_count, emergency_type, suggested_action } = aiParsed;
    
    const db = await getDb();
    const incidentIdString = "inc-" + Date.now().toString();
    
    // Map Claude's 1-5 severity back to our textual metrics
    let stringSeverity = "medium";
    if (severity >= 4) stringSeverity = "critical";
    else if (severity === 3) stringSeverity = "high";
    else if (severity <= 2) stringSeverity = "low";

    const newIncident = {
      incidentId: incidentIdString,
      id: incidentIdString,
      incident_code: "CIV-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
      title: `AI Extracted: ${emergency_type} at ${location.substring(0, 15)}`,
      incident_type: emergency_type,
      district: location,
      description: `[RAW SMS LOG] "${raw_sms}"\n\n[CLAUDE TACTICAL RESPONSE] ${suggested_action}`,
      severity: stringSeverity,
      affected_estimate: parseInt(people_count) || 1,
      reporter_phone: phone_number,
      reporter_name: "Twilio Cellular Ingestion",
      status: "reported",
      priority_score: severity * 20, // 5 = 100 max
      triage_notes: `Claude 3 Haiku Analysis: Generated severity ${severity}/5. Suggested action: ${suggested_action}`,
      latitude: 22.2587 + (Math.random() - 0.5),
      longitude: 71.1924 + (Math.random() - 0.5),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    
    // Autonomous Dispatch using Claude's emergency_type
    const volunteers = await db.collection("volunteers").find({ availability: "available" }).toArray();
    let targetSkills = ["Search & Rescue", "Medical"]; 
    if (emergency_type.toLowerCase().includes("fire")) targetSkills.push("Firefighting");
    if (emergency_type.toLowerCase().includes("flood")) targetSkills.push("Water Rescue");
    if (emergency_type.toLowerCase().includes("earthquake")) targetSkills.push("Heavy Machinery", "Engineering");

    const matchingVols = volunteers.filter(v => v.skills && v.skills.some(skill => targetSkills.some(ts => skill.toLowerCase().includes(ts.toLowerCase()))));
    const shuffled = matchingVols.sort(() => 0.5 - Math.random());
    const requiredHeadcount = severity >= 4 ? 8 : severity >= 3 ? 5 : 3;
    const bestFitIds = shuffled.map(v => v.id || (v._id ? v._id.toString() : null)).filter(id => id != null).slice(0, requiredHeadcount);

    newIncident.ai_dispatch_plan = {
      recommended_volunteers: bestFitIds,
      headcount_required: requiredHeadcount,
      required_resources: ["Dispatched via Twilio Live Link"],
      tactical_reasoning: `Claude Analysis determined severity ${severity}/5. Deploying ${requiredHeadcount} personnel with matrix skills: ${targetSkills.join(", ")}.`
    };

    await db.collection("incidents").insertOne(newIncident);

    // Auto-deploy personnel in the DB
    if (bestFitIds.length > 0) {
      const autoAssignments = bestFitIds.map(vid => ({
        id: "asn-" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
        incident_id: incidentIdString,
        volunteer_id: vid,
        status: "dispatched",
        notes: "Autonomously mapped by Claude 3 Haiku SMS Pipeline.",
        created_at: nowIso(),
        updated_at: nowIso()
      }));
      await db.collection("assignments").insertMany(autoAssignments);
    }

    // Return exact TwiML XML formatting so Twilio ends the callback successfully
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>CivRescue AI: Received. Threat level ${severity}. Dispatching emergency teams to ${location}.</Message></Response>`);
  } catch (err) {
    console.error("Twilio Pipeline Error:", err);
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>CivRescue: Network error occurred, please try again.</Message></Response>`);
  }
});

// --- TWILIO INBOUND SMS → OUTBOUND CALL ROUTE ---
app.post("/sms", async (req, res) => {
  try {
    const senderPhone = req.body.From;
    console.log(`[SMS Hook] Incoming SMS from ${senderPhone}`);

    // Determine this server's public URL for the /voice callback
    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5001}`;

    // Initiate outbound call to the SMS sender
    await twilioClient.calls.create({
      to: senderPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${serverUrl}/voice`,
    });

    console.log(`[SMS Hook] Outbound call initiated to ${senderPhone}`);

    // Respond with empty TwiML so Twilio doesn't send a default SMS reply
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (err) {
    console.error("SMS Hook Error:", err);
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
});

// --- Phone number normalizer: ensure E.164 format for Twilio ---
function toE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

// --- CALL ME BACK: Twilio calls the user so they don't need ISD ---
app.post("/api/call/request", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });
    const to = toE164(phone);
    if (!to) return res.status(400).json({ error: "Invalid phone number" });

    // Resolve current public URL (ngrok or configured BASE_URL)
    let baseUrl = process.env.BASE_URL || "";
    if (!baseUrl) {
      try {
        const ngrokApi = await fetch("http://localhost:4040/api/tunnels");
        const ngrokData = await ngrokApi.json();
        baseUrl = ngrokData.tunnels?.find(t => t.proto === "https")?.public_url || "";
      } catch (_) {}
    }
    if (!baseUrl) return res.status(503).json({ error: "No public URL configured. Start ngrok first." });

    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${baseUrl}/voice`,
      method: "POST",
    });

    console.log(`[CallBack] Initiated call to ${to} — SID: ${call.sid}`);
    return res.json({ success: true, sid: call.sid, to });
  } catch (err) {
    console.error("[CallBack] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// --- In-memory store for multi-step voice call sessions ---
const callSessions = {};

// --- VOICE CALL ENTRY POINT (Q1: Location) ---
app.post("/voice", (req, res) => {
  const callerPhone = req.body.From || "unknown";
  console.log(`[Voice] Call connected with ${callerPhone}`);

  // Initialize session for this caller
  callSessions[callerPhone] = { phone: callerPhone };

  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Welcome to CivRescue Emergency Line. We are here to help you.
    Please tell us your exact location and a nearby landmark.
  </Say>
  <Gather input="speech" speechTimeout="auto" action="/collect-1" method="POST">
    <Say voice="Polly.Aditi" language="en-IN">Please speak now.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive any input. Goodbye.</Say>
</Response>`);
});

// --- COLLECT STEP 1: Store location, then ask emergency type ---
app.post("/collect-1", (req, res) => {
  const callerPhone = req.body.From || "unknown";
  const speechResult = req.body.SpeechResult || "";
  console.log(`[Collect-1] ${callerPhone} said: "${speechResult}"`);

  // Store location in the in-memory session
  if (!callSessions[callerPhone]) callSessions[callerPhone] = { phone: callerPhone };
  callSessions[callerPhone].location = speechResult;

  // Chain to next question: emergency type
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you. We have recorded your location as: ${speechResult}.
    Now, please tell us what type of emergency you are facing.
    Is it a fire, flood, injury, trapped, or building collapse?
  </Say>
  <Gather input="speech" speechTimeout="auto" action="/collect-2" method="POST">
    <Say voice="Polly.Aditi" language="en-IN">Please speak now.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive any input. Goodbye.</Say>
</Response>`);
});

// --- COLLECT STEP 2: Store emergency type, then ask people count ---
app.post("/collect-2", (req, res) => {
  const callerPhone = req.body.From || "unknown";
  const speechResult = req.body.SpeechResult || "";
  console.log(`[Collect-2] ${callerPhone} said: "${speechResult}"`);

  if (!callSessions[callerPhone]) callSessions[callerPhone] = { phone: callerPhone };
  callSessions[callerPhone].emergencyType = speechResult;

  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Got it. You reported a ${speechResult} emergency.
    How many people need help? Please say the number.
  </Say>
  <Gather input="speech" speechTimeout="auto" action="/collect-3" method="POST">
    <Say voice="Polly.Aditi" language="en-IN">Please speak now.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive any input. Goodbye.</Say>
</Response>`);
});

// --- COLLECT STEP 3: Store people count, ask for extra details ---
app.post("/collect-3", (req, res) => {
  const callerPhone = req.body.From || "unknown";
  const speechResult = req.body.SpeechResult || "";
  console.log(`[Collect-3] ${callerPhone} said: "${speechResult}"`);

  if (!callSessions[callerPhone]) callSessions[callerPhone] = { phone: callerPhone };
  callSessions[callerPhone].peopleCount = speechResult;

  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you. We have noted ${speechResult} people needing help.
    Finally, can you describe any additional details?
    For example, are people trapped under debris, is there a fire spreading, or do you need medical assistance?
  </Say>
  <Gather input="speech" speechTimeout="auto" action="/collect-4" method="POST">
    <Say voice="Polly.Aditi" language="en-IN">Please speak now.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">No additional details. Processing your report now.</Say>
  <Redirect method="POST">/collect-4</Redirect>
</Response>`);
});

// --- COLLECT STEP 4: Store extra details, send to Claude, save Incident ---
app.post("/collect-4", async (req, res) => {
  const callerPhone = req.body.From || "unknown";
  const speechResult = req.body.SpeechResult || "";
  console.log(`[Collect-4] ${callerPhone} said: "${speechResult}"`);

  if (!callSessions[callerPhone]) callSessions[callerPhone] = { phone: callerPhone };
  callSessions[callerPhone].extraDetails = speechResult;

  // Retrieve all four answers
  const session = callSessions[callerPhone];
  const transcript = [
    `Caller phone: ${callerPhone}`,
    `Location / Landmark: ${session.location || "unknown"}`,
    `Emergency type: ${session.emergencyType || "unknown"}`,
    `Number of people needing help: ${session.peopleCount || "unknown"}`,
    `Additional details: ${session.extraDetails || "none provided"}`,
  ].join("\n");

  console.log(`[Collect-4] Full transcript for ${callerPhone}:\n${transcript}`);

  try {
    // Send to Claude for structured extraction
    const claudeResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are an emergency dispatch AI. Given a caller transcript, return ONLY a valid JSON object (no markdown, no backticks, no extra text). The JSON must contain exactly these fields:
- "caller_phone" (string)
- "location" (string, the location they described)
- "emergency_type" (string, e.g. Fire, Flood, Injury, Trapped, Building Collapse)
- "severity" (integer 1-5, where 5 is most critical — infer from context)
- "people_affected" (integer)
- "summary" (string, a brief one-line summary of the situation)
- "lat" (number, your best estimate of latitude from the location name, default 22.3 if unsure)
- "lng" (number, your best estimate of longitude from the location name, default 71.2 if unsure)
- "timestamp" (string, current ISO 8601 timestamp)`,
      messages: [{ role: "user", content: transcript }],
    });

    const rawAiText = claudeResponse.content?.[0]?.text || "{}";
    const cleanJson = rawAiText.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error("[Collect-4] Failed to parse Claude JSON:", rawAiText);
      parsed = {
        caller_phone: callerPhone,
        location: session.location || "Unknown",
        emergency_type: session.emergencyType || "Unknown",
        severity: 3,
        people_affected: 1,
        summary: "Voice call report — AI parse failed, manual review required.",
        lat: 22.3,
        lng: 71.2,
        timestamp: new Date().toISOString(),
      };
    }

    // Save to MongoDB via Mongoose
    const incident = new Incident({
      caller_phone: parsed.caller_phone || callerPhone,
      location: parsed.location,
      emergency_type: parsed.emergency_type,
      severity: Math.min(5, Math.max(1, parseInt(parsed.severity) || 3)),
      people_affected: parseInt(parsed.people_affected) || 1,
      summary: parsed.summary,
      status: "unassigned",
      lat: parseFloat(parsed.lat) || 22.3,
      lng: parseFloat(parsed.lng) || 71.2,
      created_at: parsed.timestamp ? new Date(parsed.timestamp) : new Date(),
    });

    await incident.save();
    console.log(`[Collect-4] Incident saved: ${incident._id}`);

    // --- Auto-assign nearest available volunteer ---
    const availableVolunteers = await Volunteer.find({ availability: "available" });

    if (availableVolunteers.length > 0) {
      let nearest = null;
      let minDist = Infinity;

      for (const vol of availableVolunteers) {
        if (vol.current_lat == null || vol.current_lng == null) continue; // skip volunteers with no real GPS
        const dist = haversineKm(incident.lat, incident.lng, vol.current_lat, vol.current_lng);
        if (dist < minDist) {
          minDist = dist;
          nearest = vol;
        }
      }

      if (nearest) {
        // Assign volunteer to incident
        incident.assigned_volunteer_id = nearest._id;
        incident.status = "assigned";
        await incident.save();

        // Mark volunteer as busy
        nearest.availability = "busy";
        await nearest.save();

        console.log(`[Collect-4] Assigned volunteer ${nearest.full_name} (${nearest._id}) — ${minDist.toFixed(2)} km away`);

        // SMS to volunteer with incident details
        await twilioClient.messages.create({
          to: toE164(nearest.phone),
          from: process.env.TWILIO_PHONE_NUMBER,
          body: `🚨 CivRescue DISPATCH:\nType: ${parsed.emergency_type}\nLocation: ${parsed.location}\nSeverity: ${parsed.severity}/5\nPeople affected: ${parsed.people_affected}\nSummary: ${parsed.summary}\nPlease respond immediately.`,
        });
        console.log(`[Collect-4] SMS sent to volunteer ${nearest.full_name} (${nearest.phone})`);

        // SMS to original caller confirming help
        await twilioClient.messages.create({
          to: toE164(callerPhone),
          from: process.env.TWILIO_PHONE_NUMBER,
          body: `✅ CivRescue: Help is on the way! Volunteer ${nearest.full_name} has been dispatched and is approximately ${minDist.toFixed(1)} km from your location. Stay safe.`,
        });
        console.log(`[Collect-4] Confirmation SMS sent to caller ${callerPhone}`);
      } else {
        console.log(`[Collect-4] No volunteers with location data available for auto-assignment`);
      }
    } else {
      console.log(`[Collect-4] No available volunteers for auto-assignment`);
    }

    // Clean up session
    delete callSessions[callerPhone];

    // Confirm to caller
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    Thank you. Your emergency has been registered with severity level ${parsed.severity}.
    Our rescue team has been notified and help is on the way. Please stay safe.
  </Say>
</Response>`);
  } catch (err) {
    console.error("[Collect-3] Error:", err);
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">
    We encountered an error processing your report. Please try again or call local emergency services.
  </Say>
</Response>`);
  }
});

// --- VOLUNTEER LIVE LOCATION UPDATE ---
app.post("/api/volunteer/location", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "Missing x-user-id header" });

    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: "lat and lng are required" });

    const volunteer = await Volunteer.findOneAndUpdate(
      { user_id: userId },
      { current_lat: lat, current_lng: lng },
      { new: true },
    );

    if (!volunteer) return res.status(404).json({ error: "Volunteer not found for this user_id" });

    console.log(`[Geo] Updated ${volunteer.full_name} → (${lat}, ${lng})`);
    return res.json({ success: true, volunteer_id: volunteer._id });
  } catch (err) {
    console.error("Volunteer location update error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- GET VOLUNTEER LOCATION BY ID (for tracking map polling) ---
app.get("/api/volunteer/:id/location", async (req, res) => {
  try {
    const volunteer = await Volunteer.findById(req.params.id).select("full_name phone current_lat current_lng availability");
    if (!volunteer) return res.status(404).json({ error: "Volunteer not found" });
    const doc = volunteer.toObject ? volunteer.toObject() : volunteer;
    return res.json({ ...doc, name: doc.full_name, status: doc.availability });
  } catch (err) {
    console.error("Volunteer location fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- GET INCIDENT BY ID (for tracking map) ---
app.get("/api/incident/:id", async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    return res.json(incident);
  } catch (err) {
    console.error("Incident fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- PUBLIC EMERGENCY REPORT ENDPOINT ---
app.post("/api/report-incident", async (req, res) => {
  try {
    const { full_name, phone, location, emergency_type, people_affected } = req.body;

    if (!full_name || !phone || !location || !emergency_type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Ask Claude for severity + summary + lat/lng estimate
    let aiResult;
    try {
      const claudeRes = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: `You are an emergency dispatch AI. Given an emergency report, return ONLY a valid JSON object (no markdown, no backticks). Fields:
- "severity" (integer 1-5, 5=critical)
- "summary" (string, one-line tactical summary)
- "lat" (number, best estimate from location name, default 22.3)
- "lng" (number, best estimate from location name, default 71.2)`,
        messages: [{
          role: "user",
          content: `Reporter: ${full_name}\nPhone: ${phone}\nLocation: ${location}\nType: ${emergency_type}\nPeople affected: ${people_affected || 1}`
        }],
      });

      const raw = claudeRes.content?.[0]?.text || "{}";
      const clean = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      aiResult = JSON.parse(clean);
    } catch (e) {
      console.error("[Report] Claude parse fallback:", e);
      aiResult = { severity: 3, summary: `${emergency_type} emergency at ${location}`, lat: 22.3, lng: 71.2 };
    }

    const incident = new Incident({
      caller_phone: phone,
      location,
      emergency_type,
      severity: Math.min(5, Math.max(1, parseInt(aiResult.severity) || 3)),
      people_affected: parseInt(people_affected) || 1,
      summary: aiResult.summary || `${emergency_type} reported by ${full_name}`,
      status: "unassigned",
      lat: parseFloat(aiResult.lat) || 22.3,
      lng: parseFloat(aiResult.lng) || 71.2,
      created_at: new Date(),
    });

    await incident.save();
    console.log(`[Report] Incident ${incident._id} created — severity ${incident.severity}`);

    // Notification for admins
    await new Notification({
      target_role: "admin",
      type: "new_incident",
      incident_id: incident._id,
      title: `New ${emergency_type} incident`,
      message: `${location} — Sev ${incident.severity}/5 — ${incident.people_affected} people`,
    }).save();

    // Auto-assign nearest available volunteer
    const availableVols = await Volunteer.find({ availability: "available" });
    let assignedVol = null;
    let minDist = Infinity;

    for (const vol of availableVols) {
      if (vol.current_lat == null || vol.current_lng == null) continue; // skip volunteers with no real GPS
      const dist = haversineKm(incident.lat, incident.lng, vol.current_lat, vol.current_lng);
      if (dist < minDist) { minDist = dist; assignedVol = vol; }
    }

    if (assignedVol) {
      incident.assigned_volunteer_id = assignedVol._id;
      incident.status = "assigned";
      await incident.save();
      assignedVol.availability = "busy";
      await assignedVol.save();
      console.log(`[Report] Assigned ${assignedVol.full_name} — ${minDist.toFixed(2)} km`);

      // Notification for the assigned volunteer
      await new Notification({
        target_role: "volunteer",
        target_user_id: assignedVol._id.toString(),
        type: "assignment",
        incident_id: incident._id,
        title: `New assignment: ${emergency_type}`,
        message: `${location} — Sev ${incident.severity}/5`,
      }).save();

      // SMS to volunteer
      try {
        await twilioClient.messages.create({
          to: toE164(assignedVol.phone),
          from: process.env.TWILIO_PHONE_NUMBER,
          body: `🚨 CivRescue DISPATCH:\nType: ${emergency_type}\nLocation: ${location}\nSeverity: ${incident.severity}/5\nPeople: ${incident.people_affected}\nReporter: ${full_name} (${phone})\nRespond immediately.`,
        });
      } catch (smsErr) { console.error("[Report] Volunteer SMS failed:", smsErr.message); }

      // SMS to reporter
      try {
        await twilioClient.messages.create({
          to: toE164(phone),
          from: process.env.TWILIO_PHONE_NUMBER,
          body: `✅ CivRescue: Your emergency report has been received. Volunteer ${assignedVol.full_name} has been dispatched (~${minDist.toFixed(1)} km away). Stay safe. Incident ID: ${incident._id}`,
        });
      } catch (smsErr) { console.error("[Report] Reporter SMS failed:", smsErr.message); }
    }

    return res.json({
      _id: incident._id,
      id: incident._id.toString(),
      severity: incident.severity,
      status: incident.status,
      assigned_volunteer: assignedVol ? assignedVol.full_name : null,
    });
  } catch (err) {
    console.error("[Report] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================
// AUTH, VOLUNTEER & ADMIN ENDPOINTS
// =============================================

// --- AUTH REGISTER ---
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone, role, lat, lng } = req.body;
    if (!name || !email || !password || !phone) return res.status(400).json({ error: "All fields are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email,
      phone,
      password_hash,
      role: role && ["volunteer", "admin"].includes(role) ? role : "user",
    });
    await user.save();

    // If volunteer, auto-create a Volunteer profile so they appear in roster/map
    if (user.role === "volunteer") {
      const vol = new Volunteer({
        full_name: name,
        phone,
        status: "available",
        role: "volunteer",
        user_id: user._id.toString(),
        current_lat: lat || null,
        current_lng: lng || null,
      });
      await vol.save();
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "civrescue_fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({ token, role: user.role, userId: user._id, name: user.name });
  } catch (err) {
    console.error("[Register] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- AUTH LOGIN ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "civrescue_fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      role: user.role,
      userId: user._id,
      name: user.name,
    });
  } catch (err) {
    console.error("[Auth Login] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Auto-assign the oldest/nearest queued incident to a newly-free volunteer ──
async function tryAssignPendingIncident(volunteer) {
  if (!volunteer) return;

  // Unassigned incidents sorted: highest severity first, then oldest first
  const pending = await Incident.find({
    status: "unassigned",
    assigned_volunteer_id: null,
  }).sort({ severity: -1, created_at: 1 }).limit(20);

  if (pending.length === 0) {
    console.log(`[Queue] No pending incidents for ${volunteer.full_name}`);
    return;
  }

  // Pick nearest incident if volunteer has GPS, otherwise fall back to first (highest sev)
  let chosen = pending[0];
  if (volunteer.current_lat != null && volunteer.current_lng != null) {
    let minDist = Infinity;
    for (const inc of pending) {
      if (inc.lat == null || inc.lng == null) continue;
      const d = haversineKm(inc.lat, inc.lng, volunteer.current_lat, volunteer.current_lng);
      if (d < minDist) { minDist = d; chosen = inc; }
    }
  }

  // Atomic assignment — only succeeds if the incident is still unassigned
  const atomicResult = await Incident.findOneAndUpdate(
    { _id: chosen._id, status: "unassigned", assigned_volunteer_id: null },
    { $set: { assigned_volunteer_id: volunteer._id, status: "assigned" } },
    { new: true },
  );
  if (!atomicResult) {
    // Another volunteer was assigned between our query and this update — bail out
    console.log(`[Queue] Race condition: incident ${chosen._id} already taken, skipping`);
    return;
  }

  volunteer.availability = "busy";
  await volunteer.save();

  console.log(`[Queue] Auto-assigned ${volunteer.full_name} → incident ${chosen._id} (${chosen.emergency_type} @ ${chosen.location})`);

  // In-app notification
  try {
    await new Notification({
      target_role: "volunteer",
      target_user_id: volunteer._id.toString(),
      type: "assignment",
      incident_id: chosen._id,
      title: `New Assignment: ${chosen.emergency_type}`,
      message: `${chosen.location} — Severity ${chosen.severity}/5. You were queued and are now dispatched.`,
    }).save();
  } catch (_) {}

  // SMS dispatch
  try {
    await twilioClient.messages.create({
      to: toE164(volunteer.phone),
      from: process.env.TWILIO_PHONE_NUMBER,
      body: `🚨 CivRescue DISPATCH (Queued):\nType: ${chosen.emergency_type}\nLocation: ${chosen.location}\nSeverity: ${chosen.severity}/5\nPeople: ${chosen.people_affected}\n${chosen.summary ? "Summary: " + chosen.summary + "\n" : ""}Respond immediately.`,
    });
    console.log(`[Queue] SMS sent to ${volunteer.full_name}`);
  } catch (smsErr) {
    console.warn(`[Queue] SMS failed for ${volunteer.full_name}: ${smsErr.message}`);
  }
}

// --- VOLUNTEER STATUS TOGGLE (online/offline) ---
app.patch("/api/volunteer/status", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "Missing x-user-id header" });

    const { status } = req.body; // "available" or "offline"
    if (!["available", "offline"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'available' or 'offline'" });
    }

    // Try finding by _id first, then by user_id
    let volunteer = await Volunteer.findById(userId).catch(() => null);
    if (!volunteer) volunteer = await Volunteer.findOne({ user_id: userId });
    if (!volunteer) return res.status(404).json({ error: "Volunteer not found" });

    volunteer.availability = status;
    await volunteer.save();
    console.log(`[Volunteer] ${volunteer.full_name} → ${status}`);

    // When a volunteer comes back online/available, immediately try to assign any queued incident
    if (status === "available") {
      tryAssignPendingIncident(volunteer).catch(e => console.error("[Queue] Auto-assign error:", e.message));
    }

    return res.json({ success: true, status: volunteer.availability });
  } catch (err) {
    console.error("[Volunteer Status] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- VOLUNTEER LOCATION UPDATE (PATCH - 15s interval) ---
app.patch("/api/volunteer/location", async (req, res) => {
  try {
    const rawAuth = req.headers["authorization"]?.replace("Bearer ", "") || req.headers["x-user-id"];
    if (!rawAuth) return res.status(401).json({ error: "Missing auth" });

    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: "lat and lng required" });

    // Try to decode as JWT first, fall back to treating as raw userId
    let userId = rawAuth;
    try {
      const decoded = jwt.verify(rawAuth, process.env.JWT_SECRET || "civrescue_fallback_secret");
      userId = decoded.userId || rawAuth;
    } catch (_) {
      // Not a valid JWT — use rawAuth as userId directly
      if (rawAuth.startsWith("vol-")) userId = rawAuth.replace("vol-", "");
    }

    let volunteer = await Volunteer.findById(userId).catch(() => null);
    if (!volunteer) volunteer = await Volunteer.findOne({ user_id: userId });
    if (!volunteer) return res.status(404).json({ error: "Volunteer not found" });

    volunteer.current_lat = lat;
    volunteer.current_lng = lng;
    await volunteer.save();
    return res.json({ success: true });
  } catch (err) {
    console.error("[Vol Location PATCH] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- GET INCIDENTS ASSIGNED TO A VOLUNTEER ---
app.get("/api/volunteer/:id/incidents", async (req, res) => {
  try {
    const userIdOrVolId = req.params.id;
    let volunteer = await Volunteer.findById(userIdOrVolId).catch(() => null);
    if (!volunteer) volunteer = await Volunteer.findOne({ user_id: userIdOrVolId });
    
    if (!volunteer) return res.json([]);
    
    // Support either the Volunteer's Mongoose ID, or the "id" string, or old Supabase formats
    const incidents = await Incident.find({
      $or: [
        { assigned_volunteer_id: volunteer._id.toString() },
        { assigned_volunteer_id: volunteer.id }
      ]
    }).sort({ created_at: -1 });
    
    // Map _id to id
    const data = incidents.map(d => {
      const doc = d.toObject ? d.toObject() : d;
      return { ...doc, id: doc.id || (doc._id ? doc._id.toString() : null) };
    });
    
    return res.json(data);
  } catch (err) {
    console.error("[Vol Incidents] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- VOLUNTEER ACCEPT/RESOLVE INCIDENT ---
app.patch("/api/incident/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    incident.status = status;
    await incident.save();

    // If resolved, free up the volunteer and immediately re-dispatch to any queued incident
    if (status === "resolved" && incident.assigned_volunteer_id) {
      const freedVol = await Volunteer.findByIdAndUpdate(
        incident.assigned_volunteer_id,
        { availability: "available" },
        { new: true },
      );
      if (freedVol) {
        tryAssignPendingIncident(freedVol).catch(e => console.error("[Queue] Auto-assign error:", e.message));
      }
    }

    return res.json({ success: true, status: incident.status });
  } catch (err) {
    console.error("[Incident Status] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: MANUAL ASSIGN VOLUNTEER TO INCIDENT ---
app.post("/api/admin/assign", async (req, res) => {
  try {
    const { incidentId, volunteerId } = req.body;
    const incident = await Incident.findById(incidentId);
    if (!incident) return res.status(404).json({ error: "Incident not found" });

    const volunteer = await Volunteer.findById(volunteerId);
    if (!volunteer) return res.status(404).json({ error: "Volunteer not found" });

    incident.assigned_volunteer_id = volunteer._id;
    incident.status = "assigned";
    await incident.save();

    volunteer.availability = "busy";
    await volunteer.save();

    // Notification for admin-assigned volunteer
    await new Notification({
      target_role: "volunteer",
      target_user_id: volunteer._id.toString(),
      type: "assignment",
      incident_id: incident._id,
      title: `Assigned: ${incident.emergency_type}`,
      message: `${incident.location} — Sev ${incident.severity}/5`,
    }).save();
    // Admin notification
    await new Notification({
      target_role: "admin",
      type: "assignment",
      incident_id: incident._id,
      title: `Volunteer assigned: ${volunteer.full_name}`,
      message: `${incident.emergency_type} at ${incident.location}`,
    }).save();

    // Send SMS to volunteer
    try {
      await twilioClient.messages.create({
        to: toE164(volunteer.phone),
        from: process.env.TWILIO_PHONE_NUMBER,
        body: `🚨 CivRescue DISPATCH:\nType: ${incident.emergency_type}\nLocation: ${incident.location}\nSeverity: ${incident.severity}/5\nRespond immediately.`,
      });
    } catch (smsErr) { console.error("[Admin Assign] SMS failed:", smsErr.message); }

    console.log(`[Admin] Assigned ${volunteer.full_name} to incident ${incident._id}`);
    return res.json({ success: true });
  } catch (err) {
    console.error("[Admin Assign] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: DASHBOARD STATS ---
app.get("/api/admin/stats", async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalToday, unassigned, activeVols, resolved] = await Promise.all([
      Incident.countDocuments({ created_at: { $gte: todayStart } }),
      Incident.countDocuments({ status: "unassigned" }),
      Volunteer.countDocuments({ status: { $in: ["available", "busy"] } }),
      Incident.countDocuments({ status: "resolved" }),
    ]);

    return res.json({ totalToday, unassigned, activeVols, resolved });
  } catch (err) {
    console.error("[Admin Stats] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: ALL VOLUNTEERS WITH STATS ---
app.get("/api/admin/volunteers", async (req, res) => {
  try {
    const volunteers = await Volunteer.find({}).lean();
    // Enrich with resolved count
    const enriched = await Promise.all(volunteers.map(async (vol) => {
      const resolvedCount = await Incident.countDocuments({
        assigned_volunteer_id: vol._id,
        status: "resolved",
      });
      return { ...vol, name: vol.full_name, status: vol.availability, resolved_count: resolvedCount };
    }));
    return res.json(enriched);
  } catch (err) {
    console.error("[Admin Volunteers] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: ALL INCIDENTS ---
app.get("/api/admin/incidents", async (req, res) => {
  try {
    const incidents = await Incident.find({}).sort({ created_at: -1 }).lean();
    return res.json(incidents);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ESCALATE INCIDENT PRIORITY ---
app.patch("/api/incident/:id/escalate", async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    incident.severity = Math.min(5, (incident.severity || 3) + 1);
    await incident.save();
    console.log(`[Escalate] Incident ${incident._id} → severity ${incident.severity}`);
    return res.json({ success: true, severity: incident.severity });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: DELETE VOLUNTEER ---
app.delete("/api/admin/volunteer/:id", async (req, res) => {
  try {
    const vol = await Volunteer.findByIdAndDelete(req.params.id);
    if (!vol) return res.status(404).json({ error: "Volunteer not found" });
    // Also remove their user account if linked
    if (vol.user_id) {
      await User.findByIdAndDelete(vol.user_id).catch(() => {});
    }
    console.log(`[Admin] Deleted volunteer ${vol.full_name}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: EDIT VOLUNTEER PROFILE ---
app.patch("/api/admin/volunteer/:id", async (req, res) => {
  try {
    const { full_name, phone, district, skills } = req.body;
    const update = {};
    if (full_name) update.full_name = full_name;
    if (phone) update.phone = phone;
    if (district) update.district = district;
    if (skills !== undefined) update.skills = Array.isArray(skills) ? skills : skills.split(",").map(s => s.trim()).filter(Boolean);
    const vol = await Volunteer.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!vol) return res.status(404).json({ error: "Volunteer not found" });
    return res.json({ success: true, volunteer: vol });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: FORCE VOLUNTEER AVAILABILITY ---
app.patch("/api/admin/volunteer/:id/force-status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["available", "offline", "busy"].includes(status)) {
      return res.status(400).json({ error: "Status must be available, offline, or busy" });
    }
    const vol = await Volunteer.findByIdAndUpdate(req.params.id, { $set: { availability: status } }, { new: true });
    if (!vol) return res.status(404).json({ error: "Volunteer not found" });
    console.log(`[Admin] Force-set ${vol.full_name} → ${status}`);
    return res.json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: BROADCAST SMS ---
app.post("/api/admin/broadcast", async (req, res) => {
  try {
    const { message, volunteerIds } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Message required" });

    const filter = volunteerIds?.length
      ? { _id: { $in: volunteerIds } }
      : {};
    const targets = await Volunteer.find(filter).lean();
    if (targets.length === 0) return res.status(404).json({ error: "No volunteers found" });

    const results = await Promise.allSettled(
      targets.map(vol =>
        twilioClient.messages.create({
          to: toE164(vol.phone),
          from: process.env.TWILIO_PHONE_NUMBER,
          body: `📢 CivRescue Admin:\n${message}`,
        })
      )
    );

    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    console.log(`[Admin Broadcast] Sent: ${sent}, Failed: ${failed}`);
    return res.json({ success: true, sent, failed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: DELETE INCIDENT ---
app.delete("/api/admin/incident/:id", async (req, res) => {
  try {
    const inc = await Incident.findByIdAndDelete(req.params.id);
    if (!inc) return res.status(404).json({ error: "Incident not found" });
    // Free volunteer if assigned
    if (inc.assigned_volunteer_id) {
      await Volunteer.findByIdAndUpdate(inc.assigned_volunteer_id, { $set: { availability: "available" } });
    }
    console.log(`[Admin] Deleted incident ${inc._id}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: VOLUNTEER INCIDENT HISTORY ---
app.get("/api/admin/volunteer/:id/history", async (req, res) => {
  try {
    const vol = await Volunteer.findById(req.params.id).lean();
    if (!vol) return res.status(404).json({ error: "Volunteer not found" });
    const history = await Incident.find({
      $or: [
        { assigned_volunteer_id: vol._id },
        { assigned_volunteer_id: vol._id.toString() },
      ],
    }).sort({ created_at: -1 }).limit(10).lean();
    return res.json(history);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- ADMIN: ENHANCED STATS ---
app.get("/api/admin/stats/enhanced", async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [totalToday, unassigned, activeVols, resolved, gpsOnline, avgSevArr] = await Promise.all([
      Incident.countDocuments({ created_at: { $gte: todayStart } }),
      Incident.countDocuments({ status: "unassigned" }),
      Volunteer.countDocuments({ availability: { $in: ["available", "busy"] } }),
      Incident.countDocuments({ status: "resolved", created_at: { $gte: todayStart } }),
      Volunteer.countDocuments({ availability: { $in: ["available", "busy"] }, current_lat: { $ne: null } }),
      Incident.aggregate([{ $group: { _id: null, avg: { $avg: "$severity" } } }]),
    ]);
    const avgSeverity = avgSevArr[0]?.avg ? parseFloat(avgSevArr[0].avg.toFixed(1)) : 0;
    return res.json({ totalToday, unassigned, activeVols, resolved, gpsOnline, avgSeverity });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- NOTIFICATIONS ---
app.get("/api/notifications", async (req, res) => {
  try {
    const role = req.headers["x-role"] || "admin";
    const userId = req.headers["x-user-id"] || "";

    const filter = role === "volunteer"
      ? { target_role: "volunteer", target_user_id: userId }
      : { target_role: "admin" };

    const notifications = await Notification.find(filter).sort({ created_at: -1 }).limit(30).lean();
    const unreadCount = await Notification.countDocuments({ ...filter, read: false });
    return res.json({ notifications, unreadCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch("/api/notifications/read", async (req, res) => {
  try {
    const role = req.headers["x-role"] || "admin";
    const userId = req.headers["x-user-id"] || "";

    const filter = role === "volunteer"
      ? { target_role: "volunteer", target_user_id: userId }
      : { target_role: "admin" };

    await Notification.updateMany({ ...filter, read: false }, { read: true });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- PUBLIC STATS (landing page live counter) ---
app.get("/api/stats", async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [totalToday, active, resolvedToday, totalVolunteers] = await Promise.all([
      Incident.countDocuments({ created_at: { $gte: todayStart } }),
      Incident.countDocuments({ status: { $in: ["assigned", "en_route", "active"] } }),
      Incident.countDocuments({ status: "resolved", created_at: { $gte: todayStart } }),
      Volunteer.countDocuments({}),
    ]);
    return res.json({ totalToday, active, resolvedToday, totalVolunteers });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`CivRescue backend running on http://localhost:${PORT}`);
  });
}

export default app;
