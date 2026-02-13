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

  if (!email || !password) {
    console.error(
      "Usage: node scripts/reset-admin-password.js --email admin@x.com --password NewPassw0rd!"
    );
    process.exit(1);
  }
  if (String(password).length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  await connectDB();

  const user = await AdminUser.findOne({ email: String(email).toLowerCase().trim() });
  if (!user) {
    console.error("Admin user not found:", email);
    process.exit(1);
  }

  user.passwordHash = await bcrypt.hash(String(password), 10);
  user.status = "ACTIVE";
  await user.save();

  console.log("Reset password for:", user.email);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});

