import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  target_role: { type: String, required: true },       // "admin" | "volunteer"
  target_user_id: { type: String, default: null },      // specific volunteer _id, or null for all admins
  type: { type: String, required: true },               // "new_incident" | "assignment" | "escalation"
  incident_id: { type: mongoose.Schema.Types.ObjectId, ref: "Incident" },
  title: { type: String, required: true },
  message: { type: String },
  read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

notificationSchema.index({ target_role: 1, read: 1, created_at: -1 });

export default mongoose.model("Notification", notificationSchema);
