import { applyCors } from "../../lib/cors.js";

function normalizeUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

function isFailureCode(code) {
  const normalizedCode = String(code || "").toUpperCase();
  if (!normalizedCode) return false;

  return !["PAYMENT_SUCCESS", "SUCCESS", "PAYMENT_PENDING", "PENDING"].includes(
    normalizedCode
  );
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const frontendBaseUrl = normalizeUrl(process.env.USER_FRONTEND_URL);
  const applicationId = String(
    req.query?.applicationId || req.query?.merchantUserId || ""
  ).trim();
  const statusCode = String(req.query?.code || req.query?.state || "").trim();
  const destinationPath = isFailureCode(statusCode) ? "/failed" : "/success";
  const destinationUrl = frontendBaseUrl
    ? `${frontendBaseUrl}${destinationPath}`
    : destinationPath;

  const redirectUrl = applicationId
    ? `${destinationUrl}?applicationId=${encodeURIComponent(applicationId)}`
    : destinationUrl;

  return res.redirect(302, redirectUrl);
}
