import { connectDB } from "../lib/db.js";
import { applyCors } from "../lib/cors.js";
import { generateApplicationId } from "../lib/applicationId.js";
import Application from "../models/Application.js";
import { createPhonePePayment, PaymentFlowError } from "./payment/create.js";
import { getAlertLimitForPlan } from "../lib/alerts.js";
import { getPlanDisplay } from "../lib/plans.js";

const PLAN_AMOUNTS = {
  INDIVIDUAL: 99,
  FAMILY: 199,
  PREMIUM: 499,
};

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveValidityMonths(value) {
  const parsed = Number(value);
  if (parsed === 6 || parsed === 12) return parsed;
  return 12;
}

function resolveAmount(plan, rawAmount) {
  const explicitAmount = Number(rawAmount);
  if (Number.isFinite(explicitAmount) && explicitAmount > 0) {
    return explicitAmount;
  }

  const mappedAmount = PLAN_AMOUNTS[plan];
  if (Number.isFinite(mappedAmount) && mappedAmount > 0) {
    return mappedAmount;
  }

  return null;
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const name = normalizeText(req.body?.name);
  const email = normalizeText(req.body?.email).toLowerCase();
  const phone = normalizeText(req.body?.phone);
  const vehicle = normalizeText(req.body?.vehicle);
  const plan = normalizeText(req.body?.plan).toUpperCase();
  const validityMonths = resolveValidityMonths(req.body?.validityMonths);
  const amount = resolveAmount(plan, req.body?.amount);

  if (!name || !email || !phone || !vehicle || !plan || !amount) {
    return res.status(400).json({
      error: "name, email, phone, vehicle, plan and valid amount are required",
    });
  }

  await connectDB();

  const applicationId = generateApplicationId();

  await Application.create({
    applicationId,
    name,
    email,
    phone,
    vehicle,
    plan,
    planDisplay: getPlanDisplay(plan),
    validityMonths,
    amount,
    baseAlertLimit: getAlertLimitForPlan(plan),
    alertLimit: getAlertLimitForPlan(plan),
    alertUsed: 0,
    alertsLeft: getAlertLimitForPlan(plan),
    extraAlertsGranted: 0,
    extraAlertsReason: "",
    extraAlertsGrantedBy: "",
    extraAlertsGrantedAt: null,
    status: "INITIATED",
  });

  try {
    const payment = await createPhonePePayment({
      applicationId,
      amount,
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
    console.error("APPLY ERROR:", error);

    const statusCode = error instanceof PaymentFlowError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: error.message || "Failed to initialize payment",
      applicationId,
    });
  }
}
