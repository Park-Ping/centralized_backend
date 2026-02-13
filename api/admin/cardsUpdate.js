import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import Application from "../../models/Application.js";
import { getPlanDisplay } from "../../lib/plans.js";
import { getAlertLimitForPlan } from "../../lib/alerts.js";
import AlertAdjustmentLog from "../../models/AlertAdjustmentLog.js";

function toTrimmedString(value) {
  return String(value || "").trim();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Number(amount.toFixed(2));
}

function parseNonNegativeInt(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseStatus(value) {
  if (value == null) return null;
  const normalized = toTrimmedString(value).toUpperCase();
  if (!normalized) return null;
  const allowed = ["ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED"];
  if (!allowed.includes(normalized)) return null;
  return normalized;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeVehicle(value) {
  const v = String(value || "").trim().toUpperCase();
  return v || null;
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const applicationId = toTrimmedString(
    req.params?.applicationId || req.query?.applicationId
  );
  if (!applicationId) {
    return res.status(400).json({ error: "applicationId is required" });
  }

  await connectDB();

  const application = await Application.findOne({ applicationId }).lean();
  if (!application) {
    return res.status(404).json({ error: "Application not found" });
  }

  if (!["ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED"].includes(application.status)) {
    return res.status(409).json({
      error: `Card can be edited only after approval (current: ${application.status})`,
    });
  }

  const name = req.body?.name != null ? toTrimmedString(req.body.name) : null;
  const phone = req.body?.phone != null ? normalizePhone(req.body.phone) : null;
  const vehicle = req.body?.vehicle != null ? normalizeVehicle(req.body.vehicle) : null;
  const status = parseStatus(req.body?.status);
  const plan = req.body?.plan != null ? toTrimmedString(req.body.plan) : null;
  const amount = req.body?.amount != null ? parseAmount(req.body.amount) : null;
  const activeDate =
    req.body?.activeDate != null ? parseDate(req.body.activeDate) : null;
  const expiryDate =
    req.body?.expiryDate != null ? parseDate(req.body.expiryDate) : null;
  const extraAlertsGranted = parseNonNegativeInt(req.body?.extraAlertsGranted);
  const extraAlertsReason =
    req.body?.extraAlertsReason != null ? toTrimmedString(req.body.extraAlertsReason) : null;
  const adjustedBy =
    req.body?.extraAlertsGrantedBy != null ? toTrimmedString(req.body.extraAlertsGrantedBy) : "support";

  const update = {};
  if (name !== null) update.name = name;
  if (req.body?.phone != null) {
    if (!/^\d{10}$/.test(String(phone || ""))) {
      return res.status(400).json({ error: "phone must be a valid 10-digit mobile number" });
    }
    update.phone = phone;
  }
  if (req.body?.vehicle != null) {
    if (!vehicle || !/^[A-Z0-9-]{6,15}$/.test(vehicle)) {
      return res.status(400).json({ error: "vehicle must be a valid registration format" });
    }
    update.vehicle = vehicle;
  }
  if (req.body?.status != null && !status) {
    return res.status(400).json({ error: "Invalid status value" });
  }
  if (status !== null) update.status = status;
  if (plan !== null) {
    const normalizedPlan = plan.toUpperCase();
    const cap = getAlertLimitForPlan(normalizedPlan);
    const currentUsed = Number.isFinite(Number(application.alertUsed))
      ? Number(application.alertUsed)
      : 0;
    const currentExtra = Number.isFinite(Number(application.extraAlertsGranted))
      ? Number(application.extraAlertsGranted)
      : 0;
    update.plan = normalizedPlan;
    update.planDisplay = getPlanDisplay(normalizedPlan);
    update.baseAlertLimit = cap;
    update.alertLimit = cap + currentExtra;
    update.alertsLeft = Math.max(cap + currentExtra - currentUsed, 0);
  }
  if (amount !== null) update.amount = amount;
  if (
    req.body?.activeDate != null &&
    req.body?.expiryDate != null &&
    activeDate &&
    expiryDate &&
    activeDate.getTime() > expiryDate.getTime()
  ) {
    return res.status(400).json({ error: "expiryDate must be after activeDate" });
  }
  if (req.body?.activeDate != null) update.approvedAt = activeDate;
  if (req.body?.expiryDate != null) update.expiryAt = expiryDate;
  if (req.body?.activeDate != null) update.startDate = activeDate;
  if (req.body?.expiryDate != null) update.endDate = expiryDate;
  if (req.body?.extraAlertsGranted != null) {
    if (extraAlertsGranted === null) {
      return res.status(400).json({ error: "extraAlertsGranted must be a non-negative integer" });
    }
    const previousExtra = Number.isFinite(Number(application.extraAlertsGranted))
      ? Number(application.extraAlertsGranted)
      : 0;
    if (extraAlertsGranted !== previousExtra && !extraAlertsReason) {
      return res.status(400).json({ error: "extraAlertsReason is required when adjusting extra alerts" });
    }
    const baseCap = Number.isFinite(Number(application.baseAlertLimit))
      ? Number(application.baseAlertLimit)
      : getAlertLimitForPlan(application.plan);
    const currentUsed = Number.isFinite(Number(application.alertUsed))
      ? Number(application.alertUsed)
      : 0;
    update.baseAlertLimit = baseCap;
    update.extraAlertsGranted = extraAlertsGranted;
    update.extraAlertsReason = extraAlertsReason;
    update.extraAlertsGrantedBy = adjustedBy || "support";
    update.extraAlertsGrantedAt = new Date();
    update.alertLimit = baseCap + extraAlertsGranted;
    update.alertsLeft = Math.max(baseCap + extraAlertsGranted - currentUsed, 0);

    const delta = extraAlertsGranted - previousExtra;
    if (delta !== 0) {
      await AlertAdjustmentLog.create({
        applicationId,
        cardNumber: String(application.cardNumber || application.cardId || ""),
        delta,
        previousExtraAlerts: previousExtra,
        newExtraAlerts: extraAlertsGranted,
        reason: extraAlertsReason,
        adjustedBy: adjustedBy || "support",
      });
    }
  }

  await Application.updateOne({ applicationId }, update);

  const updated = await Application.findOne({ applicationId })
    .select(
      "applicationId cardNumber name phone vehicle plan planDisplay amount status approvedAt expiryAt startDate endDate baseAlertLimit alertLimit alertUsed alertsLeft extraAlertsGranted extraAlertsReason extraAlertsGrantedBy extraAlertsGrantedAt +cardId"
    )
    .lean();

  const card = updated
    ? {
        ...updated,
        cardNumber: updated.cardNumber || updated.cardId || null,
      }
    : null;

  return res.json({ success: true, card });
}
