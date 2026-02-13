import nodemailer from "nodemailer";

function getTransportConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "false") === "true";

  if (!host || !user || !pass) return null;
  return { host, port, secure, auth: { user, pass } };
}

export async function sendResetOtpEmail({ to, code }) {
  const transportConfig = getTransportConfig();
  if (!transportConfig) {
    throw new Error("SMTP not configured");
  }

  const from = process.env.SMTP_FROM || transportConfig.auth.user;
  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from,
    to,
    subject: "ParkPing Admin Password Reset OTP",
    text: `Your OTP is ${code}. It is valid for 10 minutes.`,
    html: `<p>Your OTP is <b>${code}</b>.</p><p>It is valid for 10 minutes.</p>`,
  });
}

export async function sendUserLoginOtpEmail({ to, code, cardNumber }) {
  const transportConfig = getTransportConfig();
  if (!transportConfig) {
    throw new Error("SMTP not configured");
  }

  const from = process.env.SMTP_FROM || transportConfig.auth.user;
  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from,
    to,
    subject: "ParkPing User Login OTP",
    text: `Your ParkPing OTP is ${code} for card ${cardNumber}. It is valid for 10 minutes.`,
    html: `<p>Your ParkPing OTP is <b>${code}</b> for card <b>${cardNumber}</b>.</p><p>It is valid for 10 minutes.</p>`,
  });
}

export async function sendUserProfileChangeEmailOtp({ to, code }) {
  const transportConfig = getTransportConfig();
  if (!transportConfig) {
    throw new Error("SMTP not configured");
  }

  const from = process.env.SMTP_FROM || transportConfig.auth.user;
  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from,
    to,
    subject: "ParkPing Email Update OTP",
    text: `Your OTP to verify email update is ${code}. It is valid for 10 minutes.`,
    html: `<p>Your OTP to verify email update is <b>${code}</b>.</p><p>It is valid for 10 minutes.</p>`,
  });
}

export async function sendUserProfileChangePhoneOtpEmail({ to, code, newPhone }) {
  const transportConfig = getTransportConfig();
  if (!transportConfig) {
    throw new Error("SMTP not configured");
  }

  const from = process.env.SMTP_FROM || transportConfig.auth.user;
  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from,
    to,
    subject: "ParkPing Mobile Update OTP",
    text: `Your OTP to verify mobile update to +91${newPhone} is ${code}. It is valid for 10 minutes.`,
    html: `<p>Your OTP to verify mobile update to <b>+91${newPhone}</b> is <b>${code}</b>.</p><p>It is valid for 10 minutes.</p>`,
  });
}
