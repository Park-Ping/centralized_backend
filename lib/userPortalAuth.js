import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret =
    process.env.USER_PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error("USER_PORTAL_JWT_SECRET missing");
  }
  return secret;
}

export function signUserPortalToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "1d" });
}

export function verifyUserPortalToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function requireUserPortal(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) return res.status(401).json({ error: "Missing token" });
    const decoded = verifyUserPortalToken(match[1]);
    req.userPortal = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
