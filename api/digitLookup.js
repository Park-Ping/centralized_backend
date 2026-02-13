import { connectDB } from "../lib/db.js";
import Application from "../models/Application.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const digit = String(req.params?.digit || "").trim();
  if (!/^\d{4}$/.test(digit)) {
    return res.status(400).json({ error: "digit must be exactly 4 numbers" });
  }

  await connectDB();

  const suffixPattern = new RegExp(`${digit}$`);
  const matches = await Application.find({
    status: "ACTIVE",
    $or: [{ cardNumber: suffixPattern }, { cardId: suffixPattern }],
  })
    .select("phone cardNumber status +cardId updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  if (!matches.length) {
    return res.status(404).json({ error: "digit not found or not active" });
  }

  if (matches.length > 1) {
    return res.status(409).json({ error: "multiple active records for this digit" });
  }

  return res.json({ mobile: matches[0].phone });
}
