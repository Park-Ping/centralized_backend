export function getPlanDisplay(plan) {
  const p = String(plan || "").trim().toUpperCase();
  if (p === "INDIVIDUAL") return "PLUS";
  if (p === "FAMILY") return "PRIME";
  if (p === "PREMIUM") return "PRO";
  return p || "UNKNOWN";
}

export default getPlanDisplay;
