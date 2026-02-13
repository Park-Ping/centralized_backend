import mongoose from "mongoose";

const AdminAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    resourceType: { type: String, default: "admin", trim: true, index: true },
    resourceId: { type: String, default: null, trim: true },
    actorId: { type: String, default: null, trim: true },
    actorEmail: { type: String, default: null, trim: true, lowercase: true, index: true },
    actorName: { type: String, default: null, trim: true },
    status: { type: String, enum: ["SUCCESS", "FAILED", "BLOCKED"], default: "SUCCESS", index: true },
    details: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.AdminAuditLog ||
  mongoose.model("AdminAuditLog", AdminAuditLogSchema);
