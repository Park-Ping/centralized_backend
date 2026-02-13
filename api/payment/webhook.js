import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import {
  getApplicationIdFromMerchantTransactionId,
  mapPhonePeStatus,
  parsePhonePeWebhookPayload,
} from "../../lib/phonepe.js";
import Payment from "../../models/Payment.js";
import Application from "../../models/Application.js";

function toAmountInPaise(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.round(numeric);
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await connectDB();

  try {
    const payload = parsePhonePeWebhookPayload(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const merchantTransactionId = String(
      payload?.data?.merchantTransactionId || payload?.merchantTransactionId || ""
    ).trim();

    const applicationId = String(
      payload?.data?.merchantUserId ||
        payload?.merchantUserId ||
        getApplicationIdFromMerchantTransactionId(merchantTransactionId)
    ).trim();

    if (!applicationId) {
      return res.status(400).json({ error: "applicationId not found in webhook" });
    }

    const paymentStatus = mapPhonePeStatus(payload);
    const phonePeTransactionId = String(
      payload?.data?.transactionId || payload?.transactionId || ""
    ).trim();
    const amountInPaise = toAmountInPaise(payload?.data?.amount);
    const amount = amountInPaise ? Number((amountInPaise / 100).toFixed(2)) : null;

    const existingPayment = await Payment.findOne({ applicationId }).lean();
    if (existingPayment?.status === "SUCCESS" && paymentStatus === "SUCCESS") {
      return res.json({ success: true, duplicate: true });
    }

    const paymentUpdate = {
      applicationId,
      merchantTransactionId:
        merchantTransactionId || existingPayment?.merchantTransactionId || applicationId,
      phonePeTransactionId: phonePeTransactionId || null,
      status: paymentStatus,
      webhookResponse: payload,
    };

    if (amountInPaise) {
      paymentUpdate.amountInPaise = amountInPaise;
      paymentUpdate.amount = amount;
    }

    if (paymentStatus === "SUCCESS") {
      paymentUpdate.paidAt = new Date();
    } else if (!existingPayment?.paidAt) {
      paymentUpdate.paidAt = null;
    }

    await Payment.findOneAndUpdate(
      { applicationId },
      paymentUpdate,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    );

    if (paymentStatus === "SUCCESS") {
      await Application.updateOne(
        { applicationId },
        { status: "PAID_PENDING_APPROVAL" }
      );
    } else if (paymentStatus === "FAILED") {
      await Application.updateOne(
        { applicationId, status: { $ne: "ACTIVE" } },
        { status: "PAYMENT_PENDING" }
      );
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("WEBHOOK ERROR:", error);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
