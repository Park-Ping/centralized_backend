import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import Application from "../../models/Application.js";
import UserProfileChangeRequest from "../../models/UserProfileChangeRequest.js";
import { writeAdminAudit } from "../../lib/adminAudit.js";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await connectDB();

  const requestId = String(req.params?.requestId || "").trim();
  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const action = String(req.body?.action || "").trim().toUpperCase();
  const reviewNote = String(req.body?.reviewNote || "").trim();
  const reviewer = String(req.body?.reviewedBy || req.admin?.email || "admin").trim();

  if (!["APPROVE", "REJECT"].includes(action)) {
    return res.status(400).json({ error: "action must be APPROVE or REJECT" });
  }

  const request = await UserProfileChangeRequest.findById(requestId);
  if (!request) {
    return res.status(404).json({ error: "Change request not found" });
  }

  if (request.status !== "PENDING") {
    return res.status(409).json({ error: "Request already reviewed" });
  }

  if (action === "REJECT") {
    request.status = "REJECTED";
    request.reviewedBy = reviewer;
    request.reviewedAt = new Date();
    request.reviewNote = reviewNote;
    await request.save();

    await writeAdminAudit(req, {
      action: "USER_PROFILE_CHANGE_REJECT",
      status: "SUCCESS",
      details: `Rejected profile change for ${request.applicationId}`,
      resourceType: "user_profile_change_request",
      resourceId: String(request._id),
      meta: {
        applicationId: request.applicationId,
        requestedPhone: request.requestedPhone,
        requestedEmail: request.requestedEmail,
        reviewNote,
      },
    });

    return res.json({ ok: true, request });
  }

  const application = await Application.findOne({ applicationId: request.applicationId });
  if (!application) {
    return res.status(404).json({ error: "Application not found" });
  }

  const nextPhone = normalizePhone(request.requestedPhone || application.phone);
  const nextEmail = String(request.requestedEmail || application.email || "").trim().toLowerCase();

  if (nextPhone.length !== 10) {
    return res.status(400).json({ error: "Requested phone is invalid" });
  }

  if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return res.status(400).json({ error: "Requested email is invalid" });
  }

  application.phone = nextPhone;
  if (nextEmail) application.email = nextEmail;
  await application.save();

  request.status = "APPROVED";
  request.reviewedBy = reviewer;
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote;
  await request.save();

  await writeAdminAudit(req, {
    action: "USER_PROFILE_CHANGE_APPROVE",
    status: "SUCCESS",
    details: `Approved profile change for ${request.applicationId}`,
    resourceType: "user_profile_change_request",
    resourceId: String(request._id),
    meta: {
      applicationId: request.applicationId,
      previousPhone: request.currentPhone,
      previousEmail: request.currentEmail,
      newPhone: nextPhone,
      newEmail: nextEmail,
      reviewNote,
    },
  });

  return res.json({ ok: true, request });
}
