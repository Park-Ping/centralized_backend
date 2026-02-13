import { connectDB } from "../lib/db.js";
import Application from "../models/Application.js";
import { getAlertLimitForPlan } from "../lib/alerts.js";

const FALLBACK_NUMBER = process.env.IVR_FALLBACK_NUMBER || "+918750920902";
const INDIA_TZ = "Asia/Kolkata";

function toIndiaDateKey(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function toPlus91(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const local = digits.slice(-10);
  if (local.length !== 10) return "";
  return `+91${local}`;
}

function pickDigit(req) {
  const raw =
    req.query?.digits ??
    req.query?.Digits ??
    req.query?.digit ??
    "";
  return String(raw).replaceAll('"', "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).type("text/plain").send("Method not allowed");
  }

  const digit = pickDigit(req);
  if (!digit) {
    return res.status(200).type("text/plain").send(FALLBACK_NUMBER);
  }

  await connectDB();

  const query = {
    $and: [
      { $or: [{ cardNumber: digit }, { cardId: digit }] },
      { status: { $in: ["ACTIVE", "active"] } },
    ],
  };

  const card = await Application.findOne(query)
    .select("phone plan alertLimit alertUsed approvedAt")
    .lean();

  if (!card) {
    return res.status(200).type("text/plain").send(FALLBACK_NUMBER);
  }

  const resolvedLimit = Number.isFinite(Number(card.alertLimit))
    ? Number(card.alertLimit)
    : getAlertLimitForPlan(card.plan);
  const currentUsed = Number.isFinite(Number(card.alertUsed))
    ? Number(card.alertUsed)
    : 0;

  if (resolvedLimit <= 0 || currentUsed >= resolvedLimit) {
    return res.status(200).type("text/plain").send(FALLBACK_NUMBER);
  }
  if (card?.approvedAt) {
    const activationDateIndia = toIndiaDateKey(card.approvedAt);
    const todayIndia = toIndiaDateKey(new Date());
    if (activationDateIndia && todayIndia && activationDateIndia > todayIndia) {
      return res.status(200).type("text/plain").send(FALLBACK_NUMBER);
    }
  }

  const consumed = await Application.findOneAndUpdate(
    {
      ...query,
      alertUsed: { $lt: resolvedLimit },
    },
    {
      $inc: { alertUsed: 1 },
      $set: {
        alertLimit: resolvedLimit,
        alertsLeft: Math.max(resolvedLimit - (currentUsed + 1), 0),
      },
    },
    { new: true }
  )
    .select("phone")
    .lean();

  if (!consumed) {
    return res.status(200).type("text/plain").send(FALLBACK_NUMBER);
  }

  const mobile = toPlus91(consumed?.phone);
  if (!mobile) {
    return res.status(200).type("text/plain").send(FALLBACK_NUMBER);
  }

  return res.status(200).type("text/plain").send(mobile);
}
