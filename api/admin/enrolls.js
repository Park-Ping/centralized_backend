import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import Application from "../../models/Application.js";
import Payment from "../../models/Payment.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await connectDB();

  const applications = await Application.find({
    status: "PAID_PENDING_APPROVAL",
  })
    .sort({ createdAt: -1 })
    .lean();

  const applicationIds = applications.map((item) => item.applicationId);
  const payments = await Payment.find({
    applicationId: { $in: applicationIds },
  }).lean();

  const paymentByApplicationId = new Map(
    payments.map((payment) => [payment.applicationId, payment])
  );

  const rows = applications.map((application) => ({
    ...application,
    payment: paymentByApplicationId.get(application.applicationId) || null,
  }));

  return res.status(200).json(rows);
}
