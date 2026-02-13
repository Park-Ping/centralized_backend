import mongoose from "mongoose";

const UserProfileChangeRequestSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, trim: true, index: true },
    cardNumber: { type: String, default: "", trim: true, index: true },
    requestedPhone: { type: String, default: "", trim: true },
    requestedEmail: { type: String, default: "", trim: true, lowercase: true },
    currentPhone: { type: String, default: "", trim: true },
    currentEmail: { type: String, default: "", trim: true, lowercase: true },
    reason: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    reviewedBy: { type: String, default: "", trim: true },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    collection: "user_profile_change_requests",
  }
);

UserProfileChangeRequestSchema.index({ applicationId: 1, status: 1, createdAt: -1 });

export default mongoose.models.UserProfileChangeRequest ||
  mongoose.model("UserProfileChangeRequest", UserProfileChangeRequestSchema);
