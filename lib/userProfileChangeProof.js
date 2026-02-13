import jwt from "jsonwebtoken";

export function verifyEmailChangeProof(token) {
  const secret = process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "fallback-secret";
  return jwt.verify(token, secret);
}
