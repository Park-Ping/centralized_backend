import crypto from "crypto";
import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import UserPortalOtp from "../../models/UserPortalOtp.js";
import { signUserPortalToken } from "../../lib/userPortalAuth.js";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeCard(value) {
  return String(value || "").trim().toUpperCase();
}

function cardVariants(value) {
  const normalized = normalizeCard(value);
  if (!normalized) return [];
  const deZero = normalized.replace(/^0+/, "");
  return [...new Set([normalized, deZero].filter(Boolean))];
}

function phoneVariants(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];
  return [...new Set([normalized, `+91${normalized}`])];
}

function buildCardQuery(cards) {
  return {
    $or: [{ cardNumber: { $in: cards } }, { cardId: { $in: cards } }],
  };
}

function hashCode(applicationId, code) {
  const secret =
    process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return crypto
    .createHash("sha256")
    .update(`${applicationId}|${code}|${secret}`)
    .digest("hex");
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const phone = normalizePhone(req.body?.phone);
  const cardNumber = normalizeCard(req.body?.cardNumber);
  const phones = phoneVariants(phone);
  const cards = cardVariants(cardNumber);
  const otp = String(req.body?.otp || "").trim();

  if (!phone || !cardNumber || !otp) {
    return res.status(400).json({ error: "phone, cardNumber and otp are required" });
  }

  await connectDB();

  const byCard = await Application.findOne({
    ...buildCardQuery(cards),
    status: { $in: ["ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED"] },
  }).lean();

  if (!byCard) {
    return res.status(404).json({ error: "No registered user found for mobile and card number" });
  }

  if (!phones.includes(normalizePhone(byCard.phone))) {
    return res.status(400).json({ error: "Mobile number does not match this card" });
  }

  const application = byCard;

  const reset = await UserPortalOtp.findOne({
    applicationId: application.applicationId,
    usedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!reset) {
    return res.status(400).json({ error: "OTP not requested or expired" });
  }

  if (reset.expiresAt && new Date(reset.expiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: "OTP expired. Request a new OTP." });
  }

  if (Number(reset.attempts || 0) >= 5) {
    return res.status(429).json({ error: "Too many invalid attempts. Request a new OTP." });
  }

  const isValid = reset.codeHash === hashCode(application.applicationId, otp);
  if (!isValid) {
    await UserPortalOtp.updateOne({ _id: reset._id }, { $inc: { attempts: 1 } });
    return res.status(400).json({ error: "Invalid OTP" });
  }

  await UserPortalOtp.updateOne({ _id: reset._id }, { usedAt: new Date() });

  const token = signUserPortalToken({
    kind: "user_portal",
    applicationId: application.applicationId,
    cardNumber: application.cardNumber || application.cardId || "",
    phone: application.phone,
  });

  return res.json({
    ok: true,
    token,
    profile: {
      name: application.name || "",
      email: application.email || "",
      phone: application.phone || "",
      cardNumber: application.cardNumber || application.cardId || "",
    },
  });
}
