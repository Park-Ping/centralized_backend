import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import { connectDB } from "./lib/db.js";
import { buildCorsOptions } from "./lib/cors.js";
import applyHandler from "./api/apply.js";
import paymentWebhookHandler from "./api/payment/webhook.js";
import paymentCallbackHandler from "./api/payment/callback.js";
import paymentStatusHandler from "./api/payment/status.js";
import paymentRetryHandler from "./api/payment/retry.js";
import digitLookupHandler from "./api/digitLookup.js";
import lookupHandler from "./api/lookup.js";
import adminEnrollsHandler from "./api/admin/enrolls.js";
import adminPaymentsHandler from "./api/admin/payments.js";
import adminApproveHandler from "./api/admin/approve/[applicationId].js";
import adminSummaryHandler from "./api/admin/summary.js";
import adminCardsHandler from "./api/admin/cards.js";
import adminCardsUpdateHandler from "./api/admin/cardsUpdate.js";
import adminAuthLoginHandler from "./api/admin/authLogin.js";
import adminAuthForgotPasswordRequestHandler from "./api/admin/authForgotPasswordRequest.js";
import adminAuthForgotPasswordConfirmHandler from "./api/admin/authForgotPasswordConfirm.js";
import adminUsersHandler from "./api/admin/users.js";
import adminUsersUpdateHandler from "./api/admin/usersUpdate.js";
import adminUsersDeleteHandler from "./api/admin/usersDelete.js";
import adminAuditLogsHandler from "./api/admin/auditLogs.js";
import adminAlertsUsageHandler from "./api/admin/alertsUsage.js";
import { requireAdmin, requirePermission } from "./lib/adminAuth.js";
import userAuthRequestOtpHandler from "./api/user/authRequestOtp.js";
import userAuthVerifyOtpHandler from "./api/user/authVerifyOtp.js";
import userProfileHandler from "./api/user/profile.js";
import userProfileChangeRequestsHandler from "./api/user/profileChangeRequests.js";
import userProfileChangeEmailOtpHandler from "./api/user/profileChangeEmailOtp.js";
import userProfileChangePhoneOtpHandler from "./api/user/profileChangePhoneOtp.js";
import { requireUserPortal } from "./lib/userPortalAuth.js";
import adminProfileChangeRequestsHandler from "./api/admin/profileChangeRequests.js";
import adminProfileChangeRequestsReviewHandler from "./api/admin/profileChangeRequestsReview.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const corsOptions = buildCorsOptions();

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});
app.get("/digit/:digit", (req, res) => digitLookupHandler(req, res));
app.get("/api/lookup", (req, res) => lookupHandler(req, res));

app.post("/api/apply", (req, res) => applyHandler(req, res));
app.post("/api/payment/webhook", (req, res) => paymentWebhookHandler(req, res));
app.get("/api/payment/callback", (req, res) => paymentCallbackHandler(req, res));
app.get("/api/payment/status", (req, res) => paymentStatusHandler(req, res));
app.post("/api/payment/retry", (req, res) => paymentRetryHandler(req, res));
app.post("/api/user/auth/request-otp", (req, res) =>
  userAuthRequestOtpHandler(req, res)
);
app.post("/api/user/auth/verify-otp", (req, res) =>
  userAuthVerifyOtpHandler(req, res)
);
app.get("/api/user/profile", requireUserPortal, (req, res) =>
  userProfileHandler(req, res)
);
app.get("/api/user/profile-change-requests", requireUserPortal, (req, res) =>
  userProfileChangeRequestsHandler(req, res)
);
app.post("/api/user/profile-change-requests", requireUserPortal, (req, res) =>
  userProfileChangeRequestsHandler(req, res)
);
app.post("/api/user/profile-change-email-otp", requireUserPortal, (req, res) =>
  userProfileChangeEmailOtpHandler(req, res)
);
app.post("/api/user/profile-change-phone-otp", requireUserPortal, (req, res) =>
  userProfileChangePhoneOtpHandler(req, res)
);

app.post("/api/admin/auth/login", (req, res) => adminAuthLoginHandler(req, res));
app.post("/api/admin/auth/forgot-password/request", (req, res) =>
  adminAuthForgotPasswordRequestHandler(req, res)
);
app.post("/api/admin/auth/forgot-password/confirm", (req, res) =>
  adminAuthForgotPasswordConfirmHandler(req, res)
);

app.get("/api/admin/enrolls", (req, res) => adminEnrollsHandler(req, res));
app.get("/api/admin/payments", (req, res) => adminPaymentsHandler(req, res));
app.get("/api/admin/profile-change-requests", (req, res) =>
  adminProfileChangeRequestsHandler(req, res)
);
app.post("/api/admin/profile-change-requests/:requestId", (req, res) =>
  adminProfileChangeRequestsReviewHandler(req, res)
);
app.get("/api/admin/summary", (req, res) => adminSummaryHandler(req, res));
app.get("/api/admin/cards", (req, res) => adminCardsHandler(req, res));
app.post("/api/admin/cards/:applicationId", (req, res) =>
  adminCardsUpdateHandler(req, res)
);
app.post("/api/admin/approve/:applicationId", (req, res) =>
  adminApproveHandler(req, res)
);

app.get(
  "/api/admin/users",
  requireAdmin,
  requirePermission("user_management"),
  (req, res) => adminUsersHandler(req, res)
);
app.post(
  "/api/admin/users",
  requireAdmin,
  requirePermission("user_management"),
  (req, res) => adminUsersHandler(req, res)
);
app.patch(
  "/api/admin/users/:userId",
  requireAdmin,
  requirePermission("user_management"),
  (req, res) => adminUsersUpdateHandler(req, res)
);
app.delete(
  "/api/admin/users/:userId",
  requireAdmin,
  requirePermission("user_management"),
  (req, res) => adminUsersDeleteHandler(req, res)
);
app.get(
  "/api/admin/audit-logs",
  requireAdmin,
  requirePermission("user_management"),
  (req, res) => adminAuditLogsHandler(req, res)
);
app.get(
  "/api/admin/alerts-usage",
  requireAdmin,
  requirePermission("user_management"),
  (req, res) => adminAlertsUsageHandler(req, res)
);

app.use((error, req, res, next) => {
  if (error?.message?.includes("CORS")) {
    return res.status(403).json({ error: "CORS blocked for this origin" });
  }
  return next(error);
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

async function startServer() {
  try {
    await connectDB();
    app.listen(port, () => {
      console.log(`Backend running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error);
    process.exit(1);
  }
}

startServer();
