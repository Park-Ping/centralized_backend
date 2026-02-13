import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error("ADMIN_JWT_SECRET missing");
  }
  return secret;
}

export function signAdminToken(payload) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyAdminToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

export function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) return res.status(401).json({ error: "Missing token" });

    const decoded = verifyAdminToken(match[1]);
    req.admin = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = req.admin?.permissions || [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

