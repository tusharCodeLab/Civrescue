import fs from 'fs';

const filePath = './server.js';
let content = fs.readFileSync(filePath, 'utf8');

const getIncidentsBlock = `// --- GET INCIDENTS ASSIGNED TO A VOLUNTEER ---
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
  }`;

// Replace the buggy block
const startIncidents = content.indexOf('// --- GET INCIDENTS ASSIGNED TO A VOLUNTEER ---');
const stopIncidents = content.indexOf('// --- VOLUNTEER ACCEPT/RESOLVE INCIDENT ---');
if (startIncidents > -1 && stopIncidents > -1) {
    content = content.substring(0, startIncidents) + getIncidentsBlock + '\n\n' + content.substring(stopIncidents);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Incident assignment routing patched.');
