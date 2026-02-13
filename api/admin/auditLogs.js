import AdminAuditLog from "../../models/AdminAuditLog.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = String(req.query?.q || "").trim();
  const action = String(req.query?.action || "").trim();
  const actorEmail = String(req.query?.actorEmail || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query?.limit || 50), 200);

  const filter = {};
  if (action && action !== "all") filter.action = action;
  if (actorEmail && actorEmail !== "all") filter.actorEmail = actorEmail;
  if (q) {
    filter.$or = [
      { action: { $regex: q, $options: "i" } },
      { details: { $regex: q, $options: "i" } },
      { actorEmail: { $regex: q, $options: "i" } },
      { resourceId: { $regex: q, $options: "i" } },
    ];
  }

  const logs = await AdminAuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  return res.json({
    logs: logs.map((log) => ({
      id: String(log._id),
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      actorId: log.actorId,
      actorEmail: log.actorEmail,
      actorName: log.actorName,
      status: log.status,
      details: log.details,
      meta: log.meta || {},
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    })),
  });
}
