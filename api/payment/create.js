import { connectDB } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import {
  buildPhonePePayload,
  createMerchantTransactionId,
  extractPaymentUrl,
} from "../../lib/phonepe.js";
import Payment from "../../models/Payment.js";

export class PaymentFlowError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "PaymentFlowError";
    this.statusCode = statusCode;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Number(amount.toFixed(2));
}

function isBypassEnabled() {
  const value = String(process.env.PHONEPE_BYPASS || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function getUserSuccessUrl(applicationId) {
  const base = String(process.env.USER_FRONTEND_URL || "").trim().replace(/\/$/, "");
  const path = `/success?applicationId=${encodeURIComponent(applicationId)}`;
  return base ? `${base}${path}` : path;
}

export async function createPhonePePayment({ applicationId, amount }) {
  const appId = normalizeText(applicationId);
  const numericAmount = normalizeAmount(amount);

  if (!appId) {
    throw new PaymentFlowError(400, "applicationId is required");
  }

  if (!numericAmount) {
    throw new PaymentFlowError(400, "amount must be a positive number");
  }

  const amountInPaise = Math.round(numericAmount * 100);
  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    throw new PaymentFlowError(400, "amount must be at least 0.01");
  }

  await connectDB();

  if (isBypassEnabled()) {
    const merchantTransactionId = createMerchantTransactionId(appId);
    const amountInPaise = Math.round(numericAmount * 100);
    const paymentUrl = getUserSuccessUrl(appId);

    await Payment.findOneAndUpdate(
      { applicationId: appId },
      {
        applicationId: appId,
        merchantTransactionId,
        phonePeTransactionId: "BYPASS",
        amount: numericAmount,
        amountInPaise,
        status: "SUCCESS",
        paymentUrl,
        webhookResponse: { bypass: true },
        paidAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return {
      applicationId: appId,
      merchantTransactionId,
      paymentUrl,
      bypassed: true,
    };
  }

  const alreadyPaid = await Payment.findOne({
    applicationId: appId,
    status: "SUCCESS",
  }).lean();

  if (alreadyPaid) {
    throw new PaymentFlowError(
      409,
      "Payment is already completed for this application"
    );
  }

  const merchantTransactionId = createMerchantTransactionId(appId);
  const phonePePayload = buildPhonePePayload({
    applicationId: appId,
    merchantTransactionId,
    amountInPaise,
  });

  await Payment.findOneAndUpdate(
    { applicationId: appId },
    {
      applicationId: appId,
      merchantTransactionId,
      phonePeTransactionId: null,
      amount: numericAmount,
      amountInPaise,
      status: "PENDING",
      paymentUrl: null,
      webhookResponse: null,
      paidAt: null,
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  let phonePeResponse;
  let phonePeData = null;

  try {
    phonePeResponse = await fetch(phonePePayload.config.payApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": phonePePayload.xVerify,
      },
      body: JSON.stringify({ request: phonePePayload.base64Payload }),
    });

    phonePeData = await phonePeResponse.json();
  } catch (error) {
    await Payment.updateOne(
      { applicationId: appId },
      {
        status: "FAILED",
      }
    );

    throw new PaymentFlowError(502, "PhonePe pay API request failed");
  }

  if (!phonePeResponse.ok || phonePeData?.success === false) {
    await Payment.updateOne(
      { applicationId: appId },
      {
        status: "FAILED",
      }
    );

    throw new PaymentFlowError(
      502,
      phonePeData?.message || "PhonePe payment initialization failed"
    );
  }

  const paymentUrl = extractPaymentUrl(phonePeData);
  if (!paymentUrl) {
    await Payment.updateOne(
      { applicationId: appId },
      {
        status: "FAILED",
      }
    );

    throw new PaymentFlowError(502, "PhonePe response missing paymentUrl");
  }

  await Payment.updateOne(
    { applicationId: appId },
    {
      merchantTransactionId,
      amount: numericAmount,
      amountInPaise,
      status: "PENDING",
      paymentUrl,
    }
  );

  return {
    applicationId: appId,
    merchantTransactionId,
    paymentUrl,
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payment = await createPhonePePayment({
      applicationId: req.body?.applicationId,
      amount: req.body?.amount,
    });

    return res.status(200).json({
      applicationId: payment.applicationId,
      paymentUrl: payment.paymentUrl,
      merchantTransactionId: payment.merchantTransactionId,
    });
  } catch (error) {
    console.error("PAYMENT CREATE ERROR:", error);
    const statusCode = error instanceof PaymentFlowError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Payment initialization failed",
    });
  }
}
