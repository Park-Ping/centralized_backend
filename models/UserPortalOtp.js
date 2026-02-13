import mongoose from "mongoose";

const userPortalOtpSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "user_portal_otp" }
);

export default mongoose.models.UserPortalOtp ||
  mongoose.model("UserPortalOtp", userPortalOtpSchema);
