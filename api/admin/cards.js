import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import Application from "../../models/Application.js";
import { getAlertLimitForPlan } from "../../lib/alerts.js";

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getExpiryDays(validityMonths) {
  const months = Number(validityMonths);
  if (months === 6) return 180;
  if (months === 12) return 365;
  return 365;
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await connectDB();

  const applications = await Application.find({
    status: { $in: ["ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED"] },
  })
    .sort({ approvedAt: -1, updatedAt: -1 })
    .select(
      "applicationId cardNumber name phone vehicle plan planDisplay validityMonths amount status approvedAt expiryAt startDate endDate updatedAt baseAlertLimit alertLimit alertUsed alertsLeft extraAlertsGranted extraAlertsReason extraAlertsGrantedBy extraAlertsGrantedAt +cardId"
    )
    .lean();

  const cards = applications.map((application) => {
    const activeDate =
      application.startDate ||
      application.approvedAt ||
      application.updatedAt ||
      null;
    const expiryDays = getExpiryDays(application.validityMonths);
    const computedExpiryDate = activeDate ? addDays(activeDate, expiryDays) : null;
    const expiryDate = application.endDate || application.expiryAt || computedExpiryDate || null;
    const alertLimit = Number.isFinite(Number(application.alertLimit))
      ? Number(application.alertLimit)
      : getAlertLimitForPlan(application.plan);
    const alertUsed = Number.isFinite(Number(application.alertUsed))
      ? Number(application.alertUsed)
      : 0;
    const alertLeft = Math.max(alertLimit - alertUsed, 0);

    return {
      applicationId: application.applicationId,
      cardNumber: application.cardNumber || application.cardId || null,
      name: application.name,
      phone: application.phone,
      vehicle: application.vehicle || null,
      plan: application.plan,
      amount: application.amount,
      status: application.status,
      activeDate,
      expiryDate,
      alertLimit,
      alertUsed,
      alertLeft,
      baseAlertLimit: Number(application.baseAlertLimit || alertLimit),
      extraAlertsGranted: Number(application.extraAlertsGranted || 0),
      extraAlertsReason: String(application.extraAlertsReason || ""),
      extraAlertsGrantedBy: String(application.extraAlertsGrantedBy || ""),
      extraAlertsGrantedAt: application.extraAlertsGrantedAt || null,
    };
  });

  return res.json(cards);
}
