import crypto from "crypto";
import bcrypt from "bcryptjs";
import AdminUser from "../../models/AdminUser.js";
import AdminPasswordReset from "../../models/AdminPasswordReset.js";
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
  const otp = String(req.body?.otp || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  if (!email || !otp || !newPassword) {
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_CONFIRM",
      status: "FAILED",
      actorEmail: email || null,
      details: "Missing required fields",
    });
    return res.status(400).json({ error: "email, otp, newPassword are required" });
  }
  if (email === SUPER_ADMIN_EMAIL) {
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_CONFIRM",
      status: "BLOCKED",
      actorEmail: email,
      details: "Super admin password reset blocked",
    });
    return res.status(403).json({ error: "Password reset not allowed for super admin" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const reset = await AdminPasswordReset.findOne({ email, usedAt: null }).sort({ createdAt: -1 });
  if (!reset) return res.status(400).json({ error: "Invalid or expired OTP" });

  if (reset.expiresAt.getTime() < Date.now()) {
    await AdminPasswordReset.deleteMany({ email, usedAt: null });
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_CONFIRM",
      status: "FAILED",
      actorEmail: email,
      details: "OTP expired",
    });
    return res.status(400).json({ error: "OTP expired" });
  }

  if (reset.attempts >= 5) {
    await AdminPasswordReset.deleteMany({ email, usedAt: null });
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_CONFIRM",
      status: "FAILED",
      actorEmail: email,
      details: "Too many invalid OTP attempts",
    });
    return res.status(429).json({ error: "Too many invalid attempts. Request a new OTP." });
  }

  const ok = reset.codeHash === hashCode(email, otp);
  if (!ok) {
    reset.attempts += 1;
    await reset.save();
    await writeAdminAudit(req, {
      action: "ADMIN_FORGOT_PASSWORD_CONFIRM",
      status: "FAILED",
      actorEmail: email,
      details: "Invalid OTP",
    });
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  const user = await AdminUser.findOne({ email });
  if (!user) return res.status(404).json({ error: "Admin user not found" });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.status = "ACTIVE";
  await user.save();

  reset.usedAt = new Date();
  await reset.save();

  await AdminPasswordReset.deleteMany({ email, usedAt: null });

  await writeAdminAudit(req, {
    action: "ADMIN_FORGOT_PASSWORD_CONFIRM",
    status: "SUCCESS",
    actorEmail: email,
    actorId: String(user._id),
    actorName: user.name,
    details: "Admin password reset completed",
  });

  return res.json({ ok: true, message: "Password reset successful" });
}
