import mongoose from "mongoose";

const incidentSchema = new mongoose.Schema({
  caller_phone:          { type: String, required: true },
  location:              { type: String, required: true },
  emergency_type:        { type: String, required: true },
  severity:              { type: Number, min: 1, max: 5, required: true },
  people_affected:       { type: Number, default: 0 },
  summary:               { type: String, default: "" },
  status:                { type: String, default: "unassigned" },
  assigned_volunteer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Volunteer", default: null },
  lat:                   { type: Number },
  lng:                   { type: Number },
  created_at:            { type: Date, default: Date.now },
});

export default mongoose.model("Incident", incidentSchema);
