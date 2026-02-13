import bcrypt from "bcryptjs";
import AdminUser from "../../models/AdminUser.js";
import { signAdminToken } from "../../lib/adminAuth.js";
import { writeAdminAudit } from "../../lib/adminAudit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    await writeAdminAudit(req, {
      action: "ADMIN_LOGIN",
      status: "FAILED",
      actorEmail: String(email || "").toLowerCase().trim(),
      details: "Missing email or password",
    });
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await AdminUser.findOne({ email: String(email).toLowerCase() });
  if (!user) {
    await writeAdminAudit(req, {
      action: "ADMIN_LOGIN",
      status: "FAILED",
      actorEmail: String(email).toLowerCase().trim(),
      details: "Invalid credentials",
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status !== "ACTIVE") {
    await writeAdminAudit(req, {
      action: "ADMIN_LOGIN",
      status: "BLOCKED",
      actorEmail: user.email,
      actorId: String(user._id),
      details: "Account inactive",
    });
    return res.status(403).json({ error: "Account inactive" });
  }

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) {
    await writeAdminAudit(req, {
      action: "ADMIN_LOGIN",
      status: "FAILED",
      actorEmail: user.email,
      actorId: String(user._id),
      details: "Invalid credentials",
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const safeUser = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions || [],
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  };

  const token = signAdminToken({
    sub: safeUser.id,
    email: safeUser.email,
    permissions: safeUser.permissions,
    role: safeUser.role,
  });

  await writeAdminAudit(req, {
    action: "ADMIN_LOGIN",
    status: "SUCCESS",
    actorEmail: safeUser.email,
    actorId: safeUser.id,
    actorName: safeUser.name,
    details: "Admin login successful",
  });

  return res.json({ token, user: safeUser });
}
