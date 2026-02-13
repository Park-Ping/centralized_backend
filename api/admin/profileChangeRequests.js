import { applyCors } from "../../lib/cors.js";
import { connectDB } from "../../lib/db.js";
import UserProfileChangeRequest from "../../models/UserProfileChangeRequest.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await connectDB();

  const status = String(req.query?.status || "PENDING").trim().toUpperCase();
  const filter = {};
  if (["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    filter.status = status;
  }

  const rows = await UserProfileChangeRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  return res.json(rows);
}
