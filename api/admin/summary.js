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

  const [
    activeCards,
    inactiveCards,
    suspendedCards,
    expiredCards,
    pendingApproval,
    initiated,
    paymentPending,
    rejected,
    paymentsSuccess,
    paymentsPending,
    paymentsFailed,
  ] = await Promise.all([
    Application.countDocuments({ status: "ACTIVE" }),
    Application.countDocuments({ status: "INACTIVE" }),
    Application.countDocuments({ status: "SUSPENDED" }),
    Application.countDocuments({ status: "EXPIRED" }),
    Application.countDocuments({ status: "PAID_PENDING_APPROVAL" }),
    Application.countDocuments({ status: "INITIATED" }),
    Application.countDocuments({ status: "PAYMENT_PENDING" }),
    Application.countDocuments({ status: "REJECTED" }),
    Payment.countDocuments({ status: "SUCCESS" }),
    Payment.countDocuments({ status: "PENDING" }),
    Payment.countDocuments({ status: "FAILED" }),
  ]);

  return res.json({
    cards: {
      active: activeCards,
      inactive: inactiveCards,
      suspended: suspendedCards,
      expired: expiredCards,
    },
    applications: {
      initiated,
      paymentPending,
      pendingApproval,
      active: activeCards,
      rejected,
    },
    payments: {
      success: paymentsSuccess,
      pending: paymentsPending,
      failed: paymentsFailed,
    },
  });
}
