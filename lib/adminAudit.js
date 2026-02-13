import AdminAuditLog from "../models/AdminAuditLog.js";

function getIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) {
    return fwd.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

export async function writeAdminAudit(req, payload) {
  try {
    const actorEmail = payload?.actorEmail || req.admin?.email || null;
    const actorId = payload?.actorId || req.admin?.sub || null;
    await AdminAuditLog.create({
      action: payload.action,
      resourceType: payload.resourceType || "admin",
      resourceId: payload.resourceId || null,
      actorId,
      actorEmail: actorEmail ? String(actorEmail).toLowerCase().trim() : null,
      actorName: payload?.actorName || null,
      status: payload.status || "SUCCESS",
      details: payload.details || "",
      meta: payload.meta || {},
      ipAddress: getIp(req),
      userAgent: String(req.headers["user-agent"] || ""),
    });
  } catch {
    // Do not break primary request flow for audit write failures.
  }
}
