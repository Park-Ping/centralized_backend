import mongoose from "mongoose";

const AlertAdjustmentLogSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, index: true, trim: true },
    cardNumber: { type: String, default: "", trim: true, index: true },
    delta: { type: Number, required: true },
    previousExtraAlerts: { type: Number, required: true, min: 0 },
    newExtraAlerts: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    adjustedBy: { type: String, default: "system", trim: true, index: true },
  },
  {
    timestamps: true,
    collection: "alert_adjustment_logs",
  }
);

export default mongoose.models.AlertAdjustmentLog ||
  mongoose.model("AlertAdjustmentLog", AlertAdjustmentLogSchema);
