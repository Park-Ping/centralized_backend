import crypto from "crypto";
import jwt from "jsonwebtoken";
import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import UserProfilePhoneOtp from "../../models/UserProfilePhoneOtp.js";
import { sendUserProfileChangePhoneOtpEmail } from "../../lib/mailer.js";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashCode(applicationId, newPhone, code) {
  const secret = process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return crypto
    .createHash("sha256")
    .update(`${applicationId}|${newPhone}|${code}|${secret}`)
    .digest("hex");
}

function signPhoneProof(applicationId, newPhone) {
  const secret = process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return jwt.sign({ purpose: "phone_change", applicationId, newPhone }, secret, { expiresIn: "15m" });
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const applicationId = String(req.userPortal?.applicationId || "").trim();
  if (!applicationId) return res.status(401).json({ error: "Unauthorized" });

  const step = String(req.body?.step || "request").trim().toLowerCase();
  const newPhone = normalizePhone(req.body?.newPhone);

  if (!newPhone || newPhone.length !== 10) {
    return res.status(400).json({ error: "Valid newPhone is required" });
  }

  await connectDB();

  const app = await Application.findOne({ applicationId }).lean();
  if (!app) return res.status(404).json({ error: "Profile not found" });

  const currentPhone = normalizePhone(app.phone);
  if (newPhone === currentPhone) {
    return res.status(400).json({ error: "New mobile must be different from current mobile" });
  }

  const toEmail = normalizeEmail(app.email);
  if (!toEmail) {
    return res.status(409).json({ error: "No registered email found for OTP delivery" });
  }

  if (step === "request") {
    const recentWindow = new Date(Date.now() - 60 * 1000);
    const recent = await UserProfilePhoneOtp.countDocuments({
      applicationId,
      newPhone,
      createdAt: { $gte: recentWindow },
    });
    if (recent >= 3) {
      return res.status(429).json({ error: "Too many OTP requests. Please wait 1 minute." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await UserProfilePhoneOtp.deleteMany({ applicationId, newPhone, usedAt: null });
    await UserProfilePhoneOtp.create({
      applicationId,
      newPhone,
      codeHash: hashCode(applicationId, newPhone, code),
      expiresAt,
      attempts: 0,
    });

    try {
      await sendUserProfileChangePhoneOtpEmail({ to: toEmail, code, newPhone });
    } catch {
      await UserProfilePhoneOtp.deleteMany({ applicationId, newPhone, usedAt: null });
      return res.status(500).json({ error: "Email service unavailable" });
    }

    return res.json({ ok: true, message: "OTP sent to your registered email" });
  }

  if (step === "verify") {
    const otp = String(req.body?.otp || "").trim();
    if (!otp) return res.status(400).json({ error: "otp is required" });

    const latest = await UserProfilePhoneOtp.findOne({ applicationId, newPhone, usedAt: null })
      .sort({ createdAt: -1 })
      .lean();

    if (!latest) return res.status(400).json({ error: "OTP not requested or expired" });
    if (latest.expiresAt && new Date(latest.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "OTP expired. Request a new OTP." });
    }
    if (Number(latest.attempts || 0) >= 5) {
      return res.status(429).json({ error: "Too many invalid attempts. Request a new OTP." });
    }

    const valid = latest.codeHash === hashCode(applicationId, newPhone, otp);
    if (!valid) {
      await UserProfilePhoneOtp.updateOne({ _id: latest._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await UserProfilePhoneOtp.updateOne({ _id: latest._id }, { usedAt: new Date() });
    const phoneOtpToken = signPhoneProof(applicationId, newPhone);
    return res.json({ ok: true, phoneOtpToken });
  }

  return res.status(400).json({ error: "Invalid step" });
}
