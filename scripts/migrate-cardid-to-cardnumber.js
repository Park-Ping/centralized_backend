import "dotenv/config";
import mongoose from "mongoose";
import Application from "../models/Application.js";
import Counter from "../models/Counter.js";

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI missing");

  await mongoose.connect(mongoUri);

  const legacyCounter = await Counter.findById("cardId").lean();
  const newCounter = await Counter.findById("cardNumber").lean();
  if (!newCounter) {
    const seq =
      Number.isFinite(legacyCounter?.seq) && legacyCounter.seq >= 0
        ? legacyCounter.seq
        : 99;
    await Counter.updateOne(
      { _id: "cardNumber" },
      { $setOnInsert: { seq } },
      { upsert: true }
    );
  }

  const result = await Application.updateMany(
    { cardNumber: null, cardId: { $type: "string", $ne: "" } },
    [{ $set: { cardNumber: "$cardId" } }]
  );

  // Best-effort cleanup (safe to keep legacy fields as well).
  await Counter.deleteOne({ _id: "cardId" }).catch(() => {});

  console.log(
    JSON.stringify(
      {
        counters: { legacy: Boolean(legacyCounter), cardNumberCreated: !newCounter },
        applicationsMatched: result.matchedCount ?? result.n ?? null,
        applicationsModified: result.modifiedCount ?? result.nModified ?? null,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

