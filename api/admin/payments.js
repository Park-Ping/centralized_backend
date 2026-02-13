import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import Payment from "../../models/Payment.js";
import Application from "../../models/Application.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await connectDB();

  const applicationId = String(req.query?.applicationId || "").trim();
  const query = applicationId ? { applicationId } : {};

  const payments = await Payment.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(500)
    .lean();

  const applicationIds = [...new Set(payments.map((item) => item.applicationId))];
  const applications = await Application.find({
    applicationId: { $in: applicationIds },
  })
    .select("applicationId name phone vehicle plan status")
    .lean();

  const applicationById = new Map(
    applications.map((application) => [application.applicationId, application])
  );

  const rows = payments.map((payment) => ({
    ...payment,
    application: applicationById.get(payment.applicationId) || null,
  }));

  return res.status(200).json(rows);
}
