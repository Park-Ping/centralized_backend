import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import Application from "../../models/Application.js";
import { createPhonePePayment, PaymentFlowError } from "./create.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const applicationId = String(req.body?.applicationId || "").trim();
  if (!applicationId) {
    return res.status(400).json({ error: "applicationId is required" });
  }

  await connectDB();

  const application = await Application.findOne({ applicationId }).lean();
  if (!application) {
    return res.status(404).json({ error: "Application not found" });
  }

  if (
    application.status === "ACTIVE" ||
    application.status === "PAID_PENDING_APPROVAL"
  ) {
    return res.status(409).json({ error: "Payment is already completed" });
  }

  try {
    const payment = await createPhonePePayment({
      applicationId,
      amount: application.amount,
    });

    await Application.updateOne(
      { applicationId },
      { status: payment?.bypassed ? "PAID_PENDING_APPROVAL" : "PAYMENT_PENDING" }
    );

    return res.status(200).json({
      applicationId,
      paymentUrl: payment.paymentUrl,
    });
  } catch (error) {
    console.error("PAYMENT RETRY ERROR:", error);
    const statusCode = error instanceof PaymentFlowError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Payment retry failed",
    });
  }
}
