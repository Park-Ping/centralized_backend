import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { connectDB } from "../lib/db.js";
import AdminUser from "../models/AdminUser.js";

dotenv.config();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[i + 1];
    args[key] = value;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const password = args.password;
  const name = args.name || "Admin";

  if (!email || !password) {
    console.error(
      "Usage: node scripts/create-admin.js --email admin@x.com --password Passw0rd! --name \"Admin User\""
    );
    process.exit(1);
  }
  if (String(password).length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  await connectDB();

  const existing = await AdminUser.findOne({ email: String(email).toLowerCase() });
  if (existing) {
    console.log("Admin user already exists:", existing.email);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await AdminUser.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    passwordHash,
    status: "ACTIVE",
    role: "admin",
    permissions: ["user_management"],
  });

  console.log("Created admin:", user.email);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});

