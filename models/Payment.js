import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    merchantTransactionId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    phonePeTransactionId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
      index: true,
    },
    paymentUrl: {
      type: String,
      default: null,
    },
    webhookResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "payments",
  }
);

paymentSchema.index({ applicationId: 1, status: 1 });

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
