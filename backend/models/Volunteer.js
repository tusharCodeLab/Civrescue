import mongoose from "mongoose";

const volunteerSchema = new mongoose.Schema({
  full_name:   { type: String, required: true },
  phone:       { type: String, required: true },
  current_lat: { type: Number },
  current_lng: { type: Number },
  availability:{ type: String, default: "available" },
  district:    { type: String, default: "Unknown" },
  skills:      { type: [String], default: [] },
  role:        { type: String, default: "volunteer" },
  user_id:     { type: String, default: null },
  created_at:  { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

export default mongoose.model("Volunteer", volunteerSchema);
