import { connectDB } from "../../../lib/db.js";
import { applyCors } from "../../../lib/cors.js";
import Application from "../../../models/Application.js";
import { allocateNextCardNumber } from "../../../lib/cardId.js";
import { getAlertLimitForPlan } from "../../../lib/alerts.js";
import { getPlanDisplay } from "../../../lib/plans.js";

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const applicationId = String(
    req.params?.applicationId || req.query?.applicationId || ""
  ).trim();
  if (!applicationId) {
    return res.status(400).json({ error: "applicationId is required" });
  }

  await connectDB();

  const application = await Application.findOne({ applicationId })
    .select("applicationId status plan validityMonths cardNumber +cardId")
    .lean();
  if (!application) {
    return res.status(404).json({ error: "Application not found" });
  }

  if (application.status === "ACTIVE") {
    return res.status(200).json({
      success: true,
      applicationId,
      status: "ACTIVE",
      cardNumber: application.cardNumber || application.cardId || null,
    });
  }

  if (application.status !== "PAID_PENDING_APPROVAL") {
    return res.status(409).json({
      error: `Cannot approve application with status ${application.status}`,
    });
  }

  const cardNumber = await allocateNextCardNumber();
  const activationAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const validityMonths =
    Number(application.validityMonths) === 6 || Number(application.validityMonths) === 12
      ? Number(application.validityMonths)
      : 12;
  const expiryAt = addMonths(activationAt, validityMonths);
  const alertLimit = getAlertLimitForPlan(application.plan);

  await Application.updateOne(
    { applicationId },
    {
      status: "ACTIVE",
      cardNumber,
      planDisplay: getPlanDisplay(application.plan),
      baseAlertLimit: alertLimit,
      alertLimit,
      alertUsed: 0,
      alertsLeft: alertLimit,
      extraAlertsGranted: Number(application.extraAlertsGranted || 0),
      approvedAt: activationAt,
      expiryAt,
      startDate: activationAt,
      endDate: expiryAt,
      approvedBy: String(req.headers["x-admin-id"] || "admin"),
    }
  );

  return res
    .status(200)
    .json({ success: true, applicationId, status: "ACTIVE", cardNumber });
}
