const PLAN_ALERT_LIMITS = {
  INDIVIDUAL: 15,
  FAMILY: 15,
  PREMIUM: 15,
  PLUS: 15,
  PRIME: 15,
  PRO: 15,
};

export function getAlertLimitForPlan(plan) {
  const normalized = String(plan || "").trim().toUpperCase();
  return Number(PLAN_ALERT_LIMITS[normalized] || 0);
}

export default getAlertLimitForPlan;
