import crypto from "crypto";

export const PHONEPE_PAY_PATH = "/pg/v1/pay";
export const PHONEPE_SANDBOX_PAY_URL =
  "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";

function getRequiredEnv(primaryName, fallbackName) {
  const primaryValue = String(process.env[primaryName] || "").trim();
  const fallbackValue = fallbackName
    ? String(process.env[fallbackName] || "").trim()
    : "";

  const value = primaryValue || fallbackValue;
  if (!value) {
    if (fallbackName) {
      throw new Error(`Missing ${primaryName} or ${fallbackName}`);
    }
    throw new Error(`Missing ${primaryName}`);
  }

  return value;
}

function normalizeUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

export function getPhonePeConfig() {
  const merchantId = getRequiredEnv("PHONEPE_MERCHANT_ID");
  const saltKey = getRequiredEnv("PHONEPE_CLIENT_SECRET", "PHONEPE_SALT_KEY");
  const saltIndex = getRequiredEnv(
    "PHONEPE_CLIENT_VERSION",
    "PHONEPE_SALT_INDEX"
  );
  const backendPublicUrl = normalizeUrl(
    getRequiredEnv("BACKEND_PUBLIC_URL", "BASE_URL")
  );
  const payApiUrl =
    String(process.env.PHONEPE_PAY_API_URL || "").trim() ||
    PHONEPE_SANDBOX_PAY_URL;
  const redirectMode =
    String(process.env.PHONEPE_REDIRECT_MODE || "").trim() || "REDIRECT";

  return {
    merchantId,
    saltKey,
    saltIndex,
    backendPublicUrl,
    payApiUrl,
    redirectMode,
  };
}

export function createMerchantTransactionId(applicationId) {
  return `${applicationId}-TXN-${Date.now()}`;
}

export function getApplicationIdFromMerchantTransactionId(merchantTransactionId) {
  const id = String(merchantTransactionId || "").trim();
  const marker = "-TXN-";
  const markerIndex = id.indexOf(marker);

  if (markerIndex === -1) {
    return id;
  }

  return id.slice(0, markerIndex);
}

export function buildPhonePePayload({
  applicationId,
  merchantTransactionId,
  amountInPaise,
}) {
  const config = getPhonePeConfig();

  const payload = {
    merchantId: config.merchantId,
    merchantTransactionId,
    merchantUserId: applicationId,
    amount: amountInPaise,
    redirectUrl: `${config.backendPublicUrl}/api/payment/callback?applicationId=${encodeURIComponent(
      applicationId
    )}`,
    redirectMode: config.redirectMode,
    callbackUrl: `${config.backendPublicUrl}/api/payment/webhook`,
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  const checksumSeed = `${base64Payload}${PHONEPE_PAY_PATH}${config.saltKey}`;
  const checksumHash = crypto
    .createHash("sha256")
    .update(checksumSeed)
    .digest("hex");
  const xVerify = `${checksumHash}###${config.saltIndex}`;

  return {
    config,
    payload,
    base64Payload,
    xVerify,
  };
}

export function extractPaymentUrl(phonePeResponse) {
  return (
    phonePeResponse?.data?.instrumentResponse?.redirectInfo?.url ||
    phonePeResponse?.data?.redirectInfo?.url ||
    null
  );
}

export function parsePhonePeWebhookPayload(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  if (typeof body.response === "string") {
    try {
      const decoded = Buffer.from(body.response, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  }

  return body;
}

export function mapPhonePeStatus(payload = {}) {
  const code = String(payload.code || "").toUpperCase();
  const state = String(payload?.data?.state || payload.state || "").toUpperCase();

  if (
    code === "PAYMENT_SUCCESS" ||
    code === "SUCCESS" ||
    state === "COMPLETED" ||
    state === "SUCCESS"
  ) {
    return "SUCCESS";
  }

  if (code.includes("PENDING") || state === "PENDING") {
    return "PENDING";
  }

  return "FAILED";
}
