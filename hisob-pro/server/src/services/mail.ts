import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!config.smtp.host) {
    // Режими рушд: почта танҳо дар консол чоп мешавад
    console.log(`\n[mail] → ${to}\n[mail] ${subject}\n${text}\n`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
}
