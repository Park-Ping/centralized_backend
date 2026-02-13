import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import UserProfileChangeRequest from "../../models/UserProfileChangeRequest.js";
import { verifyEmailChangeProof } from "../../lib/userProfileChangeProof.js";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "OPTIONS"])) return;

  const applicationId = String(req.userPortal?.applicationId || "").trim();
  if (!applicationId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await connectDB();

  if (req.method === "GET") {
    const rows = await UserProfileChangeRequest.find({ applicationId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return res.json({ requests: rows });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const application = await Application.findOne({ applicationId }).lean();
  if (!application) {
    return res.status(404).json({ error: "Profile not found" });
  }

  const requestedPhone = normalizePhone(req.body?.phone);
  const requestedEmail = String(req.body?.email || "").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const emailOtpToken = String(req.body?.emailOtpToken || "").trim();
  const phoneOtpToken = String(req.body?.phoneOtpToken || "").trim();

  if (!requestedPhone && !requestedEmail) {
    return res.status(400).json({ error: "At least one field (phone/email) is required" });
  }

  if (requestedPhone && requestedPhone.length !== 10) {
    return res.status(400).json({ error: "Phone must be 10 digits" });
  }

  if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const currentPhone = normalizePhone(application.phone);
  const currentEmail = String(application.email || "").trim().toLowerCase();

  const phoneChanged = Boolean(requestedPhone && requestedPhone !== currentPhone);
  const emailChanged = Boolean(requestedEmail && requestedEmail !== currentEmail);

  if (!phoneChanged && !emailChanged) {
    return res.status(400).json({ error: "No changes detected" });
  }

  if (phoneChanged && emailChanged) {
    return res.status(400).json({ error: "Only one field can be updated per request" });
  }

  if (emailChanged) {
    if (!emailOtpToken) {
      return res.status(400).json({ error: "Email OTP verification is required" });
    }
    try {
      const proof = verifyEmailChangeProof(emailOtpToken);
      const proofAppId = String(proof?.applicationId || "").trim();
      const proofEmail = String(proof?.newEmail || "").trim().toLowerCase();
      const proofPurpose = String(proof?.purpose || "").trim();
      if (
        proofPurpose !== "email_change" ||
        proofAppId !== applicationId ||
        proofEmail !== requestedEmail
      ) {
        return res.status(400).json({ error: "Invalid email verification token" });
      }
    } catch {
      return res.status(400).json({ error: "Email OTP verification expired or invalid" });
    }
  }

  if (phoneChanged) {
    if (!phoneOtpToken) {
      return res.status(400).json({ error: "Mobile OTP verification is required" });
    }
    try {
      const proof = verifyEmailChangeProof(phoneOtpToken);
      const proofAppId = String(proof?.applicationId || "").trim();
      const proofPhone = String(proof?.newPhone || "").trim();
      const proofPurpose = String(proof?.purpose || "").trim();
      if (
        proofPurpose !== "phone_change" ||
        proofAppId !== applicationId ||
        proofPhone !== requestedPhone
      ) {
        return res.status(400).json({ error: "Invalid mobile verification token" });
      }
    } catch {
      return res.status(400).json({ error: "Mobile OTP verification expired or invalid" });
    }
  }

  const finalPhone = phoneChanged ? requestedPhone : currentPhone;
  const finalEmail = emailChanged ? requestedEmail : currentEmail;

  const pending = await UserProfileChangeRequest.findOne({ applicationId, status: "PENDING" }).lean();
  if (pending) {
    return res.status(409).json({ error: "A previous request is already pending approval" });
  }

  const created = await UserProfileChangeRequest.create({
    applicationId,
    cardNumber: String(application.cardNumber || application.cardId || ""),
    requestedPhone: finalPhone,
    requestedEmail: finalEmail,
    currentPhone,
    currentEmail,
    reason,
    status: "PENDING",
  });

  return res.status(201).json({
    ok: true,
    message: "Change request submitted for admin approval",
    request: created,
  });
}
