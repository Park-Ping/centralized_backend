import crypto from "crypto";
import jwt from "jsonwebtoken";
import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import UserProfileEmailOtp from "../../models/UserProfileEmailOtp.js";
import { sendUserProfileChangeEmailOtp } from "../../lib/mailer.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashCode(applicationId, newEmail, code) {
  const secret = process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return crypto
    .createHash("sha256")
    .update(`${applicationId}|${newEmail}|${code}|${secret}`)
    .digest("hex");
}

function signEmailProof(applicationId, newEmail) {
  const secret = process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return jwt.sign({ purpose: "email_change", applicationId, newEmail }, secret, { expiresIn: "15m" });
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const applicationId = String(req.userPortal?.applicationId || "").trim();
  if (!applicationId) return res.status(401).json({ error: "Unauthorized" });

  const step = String(req.body?.step || "request").trim().toLowerCase();
  const newEmail = normalizeEmail(req.body?.newEmail);

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ error: "Valid newEmail is required" });
  }

  await connectDB();

  const app = await Application.findOne({ applicationId }).lean();
  if (!app) return res.status(404).json({ error: "Profile not found" });

  const currentEmail = normalizeEmail(app.email);
  if (newEmail === currentEmail) {
    return res.status(400).json({ error: "New email must be different from current email" });
  }

  if (step === "request") {
    const recentWindow = new Date(Date.now() - 60 * 1000);
    const recent = await UserProfileEmailOtp.countDocuments({
      applicationId,
      newEmail,
      createdAt: { $gte: recentWindow },
    });
    if (recent >= 3) {
      return res.status(429).json({ error: "Too many OTP requests. Please wait 1 minute." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await UserProfileEmailOtp.deleteMany({ applicationId, newEmail, usedAt: null });
    await UserProfileEmailOtp.create({
      applicationId,
      newEmail,
      codeHash: hashCode(applicationId, newEmail, code),
      expiresAt,
      attempts: 0,
    });

    try {
      await sendUserProfileChangeEmailOtp({ to: newEmail, code });
    } catch {
      await UserProfileEmailOtp.deleteMany({ applicationId, newEmail, usedAt: null });
      return res.status(500).json({ error: "Email service unavailable" });
    }

    return res.json({ ok: true, message: "OTP sent to new email" });
  }

  if (step === "verify") {
    const otp = String(req.body?.otp || "").trim();
    if (!otp) return res.status(400).json({ error: "otp is required" });

    const latest = await UserProfileEmailOtp.findOne({ applicationId, newEmail, usedAt: null })
      .sort({ createdAt: -1 })
      .lean();

    if (!latest) return res.status(400).json({ error: "OTP not requested or expired" });
    if (latest.expiresAt && new Date(latest.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "OTP expired. Request a new OTP." });
    }
    if (Number(latest.attempts || 0) >= 5) {
      return res.status(429).json({ error: "Too many invalid attempts. Request a new OTP." });
    }

    const valid = latest.codeHash === hashCode(applicationId, newEmail, otp);
    if (!valid) {
      await UserProfileEmailOtp.updateOne({ _id: latest._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await UserProfileEmailOtp.updateOne({ _id: latest._id }, { usedAt: new Date() });
    const emailOtpToken = signEmailProof(applicationId, newEmail);
    return res.json({ ok: true, emailOtpToken });
  }

  return res.status(400).json({ error: "Invalid step" });
}
