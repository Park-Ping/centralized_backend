import mongoose from "mongoose";

let cached = globalThis.mongoose;
if (!cached) {
  cached = globalThis.mongoose = {
    conn: null,
    promise: null,
    indexesEnsured: false,
  };
}

async function ensureApplicationIndexes(connection) {
  if (cached.indexesEnsured) return;

  const db = connection?.connection?.db;
  if (!db) return;

  const collection = db.collection("applications");
  const indexes = await collection.indexes().catch(() => []);

  const legacyCardIdIndex = indexes.find((item) => item?.name === "cardId_1");
  if (legacyCardIdIndex?.unique) {
    await collection.dropIndex("cardId_1").catch(() => {});
  }

  const cardNumberIndex = indexes.find((item) => item?.name === "cardNumber_1");
  const shouldRebuildCardNumberIndex =
    cardNumberIndex &&
    cardNumberIndex.unique &&
    !cardNumberIndex.partialFilterExpression;

  if (shouldRebuildCardNumberIndex) {
    await collection.dropIndex("cardNumber_1").catch(() => {});
  }

  await collection
    .createIndex(
      { cardNumber: 1 },
      {
        name: "cardNumber_1",
        unique: true,
        partialFilterExpression: { cardNumber: { $type: "string", $ne: "" } },
      }
    )
    .catch(() => {});

  await collection
    .createIndex(
      { cardId: 1 },
      {
        name: "cardId_1",
        partialFilterExpression: { cardId: { $type: "string", $ne: "" } },
      }
    )
    .catch(() => {});

  cached.indexesEnsured = true;
}

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI missing");

  if (cached.conn) {
    await ensureApplicationIndexes(cached.conn);
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri).then((connection) => connection);
  }

  cached.conn = await cached.promise;
  await ensureApplicationIndexes(cached.conn);
  return cached.conn;
}

export default connectDB;
