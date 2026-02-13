function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/\/$/, "");
}

function isDomainHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost") return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  return hostname.includes(".");
}

function withWwwVariants(originValue) {
  const origin = normalizeOrigin(originValue);
  if (!origin) return [];

  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (!isDomainHost(host)) return [origin];

    const variants = new Set([origin]);
    const isWww = host.startsWith("www.");
    const altHost = isWww ? host.slice(4) : `www.${host}`;

    const altUrl = new URL(origin);
    altUrl.hostname = altHost;
    variants.add(altUrl.origin);

    return [...variants];
  } catch {
    return [origin];
  }
}

function getAllowedOrigins() {
  const configuredOrigins = [
    process.env.USER_FRONTEND_URL,
    process.env.ADMIN_FRONTEND_URL,
    process.env.FRONTEND_URL,
    process.env.FRONTEND_PUBLIC_URL,
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : []),
  ];

  const normalized = configuredOrigins
    .flatMap(withWwwVariants)
    .filter(Boolean);

  return [...new Set(normalized)];
}

function isOriginAllowed(originHeader) {
  const origin = normalizeOrigin(originHeader);
  const allowedOrigins = getAllowedOrigins();

  if (!origin) {
    return true;
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin blocked"));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Id", "X-VERIFY"],
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

export function applyCors(req, res, methods = ["GET", "POST", "PATCH", "OPTIONS"]) {
  const originHeader = req.headers.origin;

  if (originHeader && isOriginAllowed(originHeader)) {
    res.setHeader("Access-Control-Allow-Origin", normalizeOrigin(originHeader));
    res.setHeader("Vary", "Origin");
  } else if (!originHeader) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Admin-Id, X-VERIFY"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}
