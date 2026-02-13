import crypto from "crypto";
import AdminUser from "../../models/AdminUser.js";
import AdminPasswordReset from "../../models/AdminPasswordReset.js";
import { sendResetOtpEmail } from "../../lib/mailer.js";
import { writeAdminAudit } from "../../lib/adminAudit.js";

const SUPER_ADMIN_EMAIL = "admin@parkping.co.in";

function hashCode(email, code) {
  const secret = process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return crypto
    .createHash("sha256")
    .update(`${String(email).toLowerCase()}|${String(code)}|${secret}`)
    .digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = String(req.body?.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "email is required" });
  if (email === SUPER_ADMIN_EMAIL) {
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_REQUEST",
      status: "BLOCKED",
      actorEmail: email,
      details: "Super admin password reset request blocked",
    });
    return res.status(403).json({ error: "Password reset not allowed for super admin" });
  }

  const generic = {
    ok: true,
    message: "If this email is registered, OTP has been sent.",
  };

  const user = await AdminUser.findOne({ email, status: "ACTIVE" });
  if (!user) return res.json(generic);

  const recentWindow = new Date(Date.now() - 60 * 1000);
  const recentRequests = await AdminPasswordReset.countDocuments({
    email,
    createdAt: { $gte: recentWindow },
  });
  if (recentRequests >= 3) {
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_REQUEST",
      status: "FAILED",
      actorEmail: email,
      details: "Too many reset requests",
    });
    return res.status(429).json({ error: "Too many reset requests. Try again shortly." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await AdminPasswordReset.deleteMany({ email, usedAt: null });
  await AdminPasswordReset.create({
    email,
    codeHash: hashCode(email, code),
    expiresAt,
    attempts: 0,
  });

  try {
    await sendResetOtpEmail({ to: email, code });
  } catch (error) {
    await AdminPasswordReset.deleteMany({ email, usedAt: null });
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_REQUEST",
      status: "FAILED",
      actorEmail: email,
      details: "Email delivery failed",
    });
    return res.status(500).json({ error: "Email service unavailable" });
  }

  await writeAdminAudit(req, {
    action: "ADMIN_FORGOT_PASSWORD_REQUEST",
    status: "SUCCESS",
    actorEmail: email,
    details: "OTP sent for password reset",
  });

  return res.json(generic);
}
