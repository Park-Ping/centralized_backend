import bcrypt from "bcryptjs";
import AdminUser from "../../models/AdminUser.js";
import { writeAdminAudit } from "../../lib/adminAudit.js";

const SUPER_ADMIN_EMAIL = "admin@parkping.co.in";

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = req.params?.userId;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const { name, status, role, permissions, password } = req.body || {};
  const update = {};

  if (typeof name === "string") update.name = name.trim();
  if (status === "ACTIVE" || status === "INACTIVE") update.status = status;
  if (typeof role === "string") update.role = role;
  if (Array.isArray(permissions)) update.permissions = permissions.map(String);
  if (typeof password === "string" && password.length >= 8) {
    update.passwordHash = await bcrypt.hash(password, 10);
  }

  const existing = await AdminUser.findById(userId).select("email");
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (String(existing.email || "").toLowerCase() === SUPER_ADMIN_EMAIL) {
    await writeAdminAudit(req, {
      action: "ADMIN_USER_UPDATE",
      status: "BLOCKED",
      details: "Attempted super admin update",
      resourceType: "admin_user",
      resourceId: String(userId),
      meta: { targetEmail: existing.email },
    });
    return res.status(403).json({ error: "Super admin is immutable" });
  }

  const beforeUser = await AdminUser.findById(userId)
    .select("name email status role permissions")
    .lean();

  const user = await AdminUser.findByIdAndUpdate(userId, update, {
    new: true,
  }).select("-passwordHash");

  if (!user) return res.status(404).json({ error: "User not found" });

  await writeAdminAudit(req, {
    action: "ADMIN_USER_UPDATE",
    status: "SUCCESS",
    details: `Updated admin user ${user.email}`,
    resourceType: "admin_user",
    resourceId: String(user._id),
    meta: {
      targetEmail: user.email,
      changedFields: Object.keys(update),
      status: user.status,
      role: user.role,
      changes: {
        ...(beforeUser?.name !== user.name
          ? { name: { from: beforeUser?.name || "", to: user.name || "" } }
          : {}),
        ...(beforeUser?.status !== user.status
          ? { status: { from: beforeUser?.status || "", to: user.status || "" } }
          : {}),
        ...(beforeUser?.role !== user.role
          ? { role: { from: beforeUser?.role || "", to: user.role || "" } }
          : {}),
        ...(JSON.stringify(beforeUser?.permissions || []) !==
        JSON.stringify(user.permissions || [])
          ? {
              permissions: {
                from: beforeUser?.permissions || [],
                to: user.permissions || [],
              },
            }
          : {}),
      },
    },
  });

  return res.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
}
