import mongoose from "mongoose";

const UserProfilePhoneOtpSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, trim: true, index: true },
    newPhone: { type: String, required: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "user_profile_phone_otp" }
);

export default mongoose.models.UserProfilePhoneOtp ||
  mongoose.model("UserProfilePhoneOtp", UserProfilePhoneOtpSchema);
