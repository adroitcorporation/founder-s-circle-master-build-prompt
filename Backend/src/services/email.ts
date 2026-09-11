import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { token } from "../utils.js";
export async function sendEmail(email: string, subject: string, link: string) {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject,
        text: `${subject}\n\n${link}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    // Provider responses may contain private addresses; keep them out of errors.
    if (!response.ok)
      throw new Error("Unable to deliver email. Please try again.");
    return;
  }
  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject,
      text: `${subject}\n\n${link}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email.`,
    });
  } else {
    if (process.env.NODE_ENV === "production")
      throw new Error("Email delivery must be configured.");
    await mkdir("work/mail", { recursive: true });
    await writeFile(
      `work/mail/${token()}.json`,
      JSON.stringify({ email, subject, link }),
      { mode: 0o600 },
    );
  }
}
