import Application from "../../models/Application.js";
import { getAlertLimitForPlan } from "../../lib/alerts.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const status = String(req.query?.status || "ACTIVE").trim().toUpperCase();
  const q = String(req.query?.q || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query?.limit || 100), 500);

  const filter = {};
  if (status !== "ALL") filter.status = status;

  if (q) {
    filter.$or = [
      { applicationId: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
      { cardNumber: { $regex: q, $options: "i" } },
      { plan: { $regex: q, $options: "i" } },
    ];
  }

  const rows = await Application.find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("applicationId phone cardNumber +cardId plan status alertLimit alertUsed updatedAt")
    .lean();

  return res.json({
    rows: rows.map((item) => {
      const cap = Number.isFinite(Number(item.alertLimit))
        ? Number(item.alertLimit)
        : getAlertLimitForPlan(item.plan);
      const used = Number.isFinite(Number(item.alertUsed)) ? Number(item.alertUsed) : 0;
      const left = Math.max(cap - used, 0);
      return {
        applicationId: item.applicationId,
        phone: item.phone,
        cardNumber: item.cardNumber || item.cardId || null,
        plan: item.plan,
        status: item.status,
        alertLimit: cap,
        alertUsed: used,
        alertLeft: left,
        updatedAt: item.updatedAt,
      };
    }),
  });
}
