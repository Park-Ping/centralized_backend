import dotenv from "dotenv";
import { connectDB } from "../lib/db.js";
import Application from "../models/Application.js";
import { getAlertLimitForPlan } from "../lib/alerts.js";
import { getPlanDisplay } from "../lib/plans.js";

dotenv.config();

async function main() {
  await connectDB();

  const apps = await Application.find({})
    .select("applicationId plan alertLimit alertUsed alertsLeft baseAlertLimit extraAlertsGranted extraAlertsReason extraAlertsGrantedBy extraAlertsGrantedAt planDisplay approvedAt expiryAt startDate endDate")
    .lean();

  let updated = 0;
  for (const app of apps) {
    const cap = getAlertLimitForPlan(app.plan);
    const extra = Number.isFinite(Number(app.extraAlertsGranted))
      ? Number(app.extraAlertsGranted)
      : 0;
    const effectiveCap = cap + extra;
    const used = Number.isFinite(Number(app.alertUsed)) ? Number(app.alertUsed) : 0;
    const left = Math.max(effectiveCap - used, 0);
    const display = getPlanDisplay(app.plan);
    const oldCap = Number.isFinite(Number(app.alertLimit)) ? Number(app.alertLimit) : -1;
    const oldBaseCap = Number.isFinite(Number(app.baseAlertLimit)) ? Number(app.baseAlertLimit) : -1;
    const oldLeft = Number.isFinite(Number(app.alertsLeft)) ? Number(app.alertsLeft) : -1;
    const oldDisplay = String(app.planDisplay || "").trim();
    const startDate = app.startDate || app.approvedAt || null;
    const endDate = app.endDate || app.expiryAt || null;
    const hasStart = Boolean(app.startDate) || !startDate;
    const hasEnd = Boolean(app.endDate) || !endDate;
    if (
      oldCap === effectiveCap &&
      oldBaseCap === cap &&
      oldLeft === left &&
      oldDisplay === display &&
      Number.isFinite(Number(app.alertUsed)) &&
      hasStart &&
      hasEnd
    ) continue;

    // eslint-disable-next-line no-await-in-loop
    await Application.updateOne(
      { applicationId: app.applicationId },
      {
        alertLimit: effectiveCap,
        baseAlertLimit: cap,
        alertUsed: used,
        alertsLeft: left,
        planDisplay: display,
        extraAlertsGranted: extra,
        extraAlertsReason: String(app.extraAlertsReason || ""),
        extraAlertsGrantedBy: String(app.extraAlertsGrantedBy || ""),
        ...(app.extraAlertsGrantedAt ? { extraAlertsGrantedAt: app.extraAlertsGrantedAt } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      }
    );
    updated += 1;
  }

  console.log(`Backfill complete. Updated ${updated} application(s).`);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
