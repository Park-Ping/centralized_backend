import crypto from "crypto";
import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import UserPortalOtp from "../../models/UserPortalOtp.js";
import { sendUserLoginOtpEmail } from "../../lib/mailer.js";

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

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "";
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${safeLocal}@${domain}`;
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

  if (!phone || !cardNumber) {
    return res.status(400).json({ error: "phone and cardNumber are required" });
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

  if (!application.email) {
    return res.status(409).json({ error: "Email not registered for this card. Contact support." });
  }

  const recentWindow = new Date(Date.now() - 60 * 1000);
  const recentRequests = await UserPortalOtp.countDocuments({
    applicationId: application.applicationId,
    createdAt: { $gte: recentWindow },
  });
  if (recentRequests >= 3) {
    return res.status(429).json({ error: "Too many OTP requests. Please wait 1 minute." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await UserPortalOtp.deleteMany({
    applicationId: application.applicationId,
    usedAt: null,
  });

  await UserPortalOtp.create({
    applicationId: application.applicationId,
    email: application.email,
    codeHash: hashCode(application.applicationId, code),
    expiresAt,
    attempts: 0,
  });

  try {
    await sendUserLoginOtpEmail({
      to: application.email,
      code,
      cardNumber,
    });
  } catch {
    await UserPortalOtp.deleteMany({
      applicationId: application.applicationId,
      usedAt: null,
    });
    return res.status(500).json({ error: "Email service unavailable" });
  }

  return res.json({
    ok: true,
    message: "OTP sent to your registered email",
    maskedEmail: maskEmail(application.email),
  });
}
