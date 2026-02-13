import mongoose from "mongoose";

const AdminPasswordResetSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.AdminPasswordReset ||
  mongoose.model("AdminPasswordReset", AdminPasswordResetSchema);
