import bcrypt from "bcryptjs";
import AdminUser from "../../models/AdminUser.js";
import { writeAdminAudit } from "../../lib/adminAudit.js";

function toSafeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions || [],
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const users = await AdminUser.find({})
      .sort({ createdAt: -1 })
      .select("-passwordHash");
    return res.json({ users: users.map(toSafeUser) });
  }

  if (req.method === "POST") {
    const { name, email, password, status, role, permissions } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "name, email, password are required" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const existing = await AdminUser.findOne({
      email: String(email).toLowerCase().trim(),
    });
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const user = await AdminUser.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      passwordHash,
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      role: role ? String(role) : "admin",
      permissions: Array.isArray(permissions)
        ? permissions.map(String)
        : ["user_management"],
    });

    await writeAdminAudit(req, {
      action: "ADMIN_USER_CREATE",
      status: "SUCCESS",
      details: `Created admin user ${user.email}`,
      resourceType: "admin_user",
      resourceId: String(user._id),
      meta: {
        targetEmail: user.email,
        targetName: user.name,
        role: user.role,
        status: user.status,
      },
    });

    return res.status(201).json({ user: toSafeUser(user) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
