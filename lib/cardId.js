import Counter from "../models/Counter.js";

const CARD_COUNTER_ID_LEGACY = "cardId";
const CARD_COUNTER_ID = "cardNumber";
const CARD_MIN = 100;
const CARD_MAX = 9999;

function pad4(value) {
  return String(value).padStart(4, "0");
}

async function ensureCounterInitialized() {
  // MongoDB does not allow updating the same path with $inc and $setOnInsert together.
  // Ensure the counter doc exists first, then increment.
  const existing = await Counter.findById(CARD_COUNTER_ID).lean();
  if (existing) return;

  const legacy = await Counter.findById(CARD_COUNTER_ID_LEGACY).lean();
  const initialSeq =
    Number.isFinite(legacy?.seq) && legacy.seq >= 0 ? legacy.seq : CARD_MIN - 1;

  await Counter.updateOne(
    { _id: CARD_COUNTER_ID },
    { $setOnInsert: { seq: initialSeq } },
    { upsert: true }
  );

  // Best-effort cleanup; ignore failures.
  if (legacy) {
    try {
      await Counter.deleteOne({ _id: CARD_COUNTER_ID_LEGACY });
    } catch {
      // no-op
    }
  }
}

export async function allocateNextCardNumber() {
  await ensureCounterInitialized();

  const counter = await Counter.findOneAndUpdate(
    { _id: CARD_COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true }
  ).lean();

  const next = Number(counter?.seq);
  if (!Number.isInteger(next)) {
    throw new Error("Failed to allocate cardNumber");
  }

  if (next < CARD_MIN || next > CARD_MAX) {
    throw new Error("Card number limit exceeded");
  }

  return pad4(next);
}

// Backwards-compatible export (deprecated).
export async function allocateNextCardId() {
  return allocateNextCardNumber();
}
