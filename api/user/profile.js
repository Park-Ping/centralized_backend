import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import Payment from "../../models/Payment.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const applicationId = String(req.userPortal?.applicationId || "").trim();
  if (!applicationId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await connectDB();

  const application = await Application.findOne({ applicationId })
    .select(
      "applicationId cardNumber name email phone vehicle plan planDisplay status amount validityMonths startDate endDate approvedAt expiryAt alertLimit alertUsed alertsLeft baseAlertLimit extraAlertsGranted"
    )
    .lean();

  if (!application) {
    return res.status(404).json({ error: "User profile not found" });
  }

  const payment = await Payment.findOne({ applicationId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  return res.json({
    profile: {
      applicationId: application.applicationId,
      cardNumber: application.cardNumber || "",
      ownerName: application.name || "",
      email: application.email || "",
      phone: application.phone || "",
      vehicle: application.vehicle || "",
      plan: application.planDisplay || application.plan || "",
      status: application.status || "",
      amount: Number(application.amount || 0),
      validityMonths: Number(application.validityMonths || 0),
      activationDate:
        application.startDate || application.approvedAt || null,
      expiryDate: application.endDate || application.expiryAt || null,
      alerts: {
        base: Number(application.baseAlertLimit || 0),
        extra: Number(application.extraAlertsGranted || 0),
        total: Number(application.alertLimit || 0),
        used: Number(application.alertUsed || 0),
        left: Number(application.alertsLeft || 0),
      },
      payment: payment
        ? {
            status: payment.status || "",
            amount: Number(payment.amount || 0),
            merchantTransactionId: payment.merchantTransactionId || "",
            phonePeTransactionId: payment.phonePeTransactionId || "",
            paidAt: payment.paidAt || payment.updatedAt || payment.createdAt || null,
          }
        : null,
    },
  });
}
