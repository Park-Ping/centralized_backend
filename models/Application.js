import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    vehicle: { type: String, required: true, trim: true },
    plan: { type: String, required: true, trim: true },
    planDisplay: { type: String, default: "UNKNOWN", trim: true },
    validityMonths: { type: Number, default: 12, enum: [6, 12] },
    amount: { type: Number, required: true, min: 0 },
    baseAlertLimit: { type: Number, default: 0, min: 0 },
    alertLimit: { type: Number, default: 0, min: 0 },
    alertUsed: { type: Number, default: 0, min: 0 },
    alertsLeft: { type: Number, default: 0, min: 0 },
    extraAlertsGranted: { type: Number, default: 0, min: 0 },
    extraAlertsReason: { type: String, default: "", trim: true },
    extraAlertsGrantedBy: { type: String, default: "", trim: true },
    extraAlertsGrantedAt: { type: Date, default: null },
    cardNumber: {
      type: String,
      default: undefined,
      trim: true,
    },
    // Legacy field kept for backwards compatibility with existing data.
    // New writes should use `cardNumber`.
    cardId: {
      type: String,
      default: undefined,
      trim: true,
      select: false,
    },
    status: {
      type: String,
      enum: [
        "INITIATED",
        "PAYMENT_PENDING",
        "PAID_PENDING_APPROVAL",
        "ACTIVE",
        "INACTIVE",
        "SUSPENDED",
        "EXPIRED",
        "REJECTED",
      ],
      default: "INITIATED",
      index: true,
    },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null },
    expiryAt: { type: Date, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "applications",
  }
);

applicationSchema.index({ applicationId: 1, status: 1 });
applicationSchema.index(
  { cardNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { cardNumber: { $type: "string", $ne: "" } },
  }
);
// Keep legacy index to avoid breaking old data, but do not enforce uniqueness
// in case some environments already migrated and stopped writing `cardId`.
applicationSchema.index(
  { cardId: 1 },
  { partialFilterExpression: { cardId: { $type: "string", $ne: "" } } }
);

export default mongoose.models.Application ||
  mongoose.model("Application", applicationSchema);
