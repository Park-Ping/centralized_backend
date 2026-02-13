import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import Application from "../../models/Application.js";
import Payment from "../../models/Payment.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const applicationId = String(req.query?.applicationId || "").trim();
  if (!applicationId) {
    return res.status(400).json({ error: "applicationId is required" });
  }

  await connectDB();

  const application = await Application.findOne({ applicationId }).lean();
  const payment = await Payment.findOne({ applicationId }).lean();

  if (!application && !payment) {
    return res.status(404).json({ error: "applicationId not found" });
  }

  return res.json({
    applicationId,
    applicationStatus: application?.status || null,
    paymentStatus: payment?.status || null,
    application,
    payment,
  });
}
