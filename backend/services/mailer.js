import nodemailer from "nodemailer";

export const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Helper simple para enviar
export async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || "no-reply@example.com"; // CAMBIAR EN .env (SMTP_FROM)
  const toAddr = to || process.env.TEST_TO; // (opcional) CAMBIAR EN .env (TEST_TO)
  if (!toAddr) throw new Error("Falta destinatario (to o TEST_TO)");
  return mailer.sendMail({ from, to: toAddr, subject, html, text });
}
