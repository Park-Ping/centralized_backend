import AdminUser from "../../models/AdminUser.js";
import { writeAdminAudit } from "../../lib/adminAudit.js";

const SUPER_ADMIN_EMAIL = "admin@parkping.co.in";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = req.params?.userId;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  if (String(req.admin?.sub || "") === String(userId)) {
    await writeAdminAudit(req, {
      action: "ADMIN_USER_DELETE",
      status: "BLOCKED",
      details: "Attempted self delete",
      resourceType: "admin_user",
      resourceId: String(userId),
    });
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const user = await AdminUser.findById(userId).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });

  if (String(user.email || "").toLowerCase() === SUPER_ADMIN_EMAIL) {
    await writeAdminAudit(req, {
      action: "ADMIN_USER_DELETE",
      status: "BLOCKED",
      details: "Attempted super admin delete",
      resourceType: "admin_user",
      resourceId: String(userId),
      meta: { targetEmail: user.email },
    });
    return res.status(403).json({ error: "Super admin cannot be deleted" });
  }

  await AdminUser.findByIdAndDelete(userId);

  await writeAdminAudit(req, {
    action: "ADMIN_USER_DELETE",
    status: "SUCCESS",
    details: `Deleted admin user ${user.email}`,
    resourceType: "admin_user",
    resourceId: String(user._id),
    meta: { targetEmail: user.email, targetName: user.name },
  });

  return res.json({
    ok: true,
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
