import { Resend } from 'resend';
import { env } from './env.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendInviteEmail({ to, acceptUrl, inviterEmail }) {
  if (!resend || !env.resendFromEmail) {
    console.warn('Resend is not configured. Skipping invite email send.');
    return { skipped: true, emailSent: false };
  }

  const result = await resend.emails.send({
    from: env.resendFromEmail,
    to,
    subject: 'Zaproszenie do Coparentes',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Zaproszenie do Coparentes</h2>
        <p>Użytkownik <strong>${escapeHtml(inviterEmail)}</strong> zaprosił Cię do połączenia kont w Coparentes.</p>
        <p><a href="${escapeHtml(acceptUrl)}">Kliknij tutaj, aby zaakceptować zaproszenie</a></p>
        <p>Jeśli to nie Ty, zignoruj tę wiadomość.</p>
      </div>
    `
  });

  return { skipped: false, emailSent: true, result };
}

export async function sendOtpEmail({ to, code }) {
  if (!resend || !env.resendFromEmail) {
    console.warn('Resend is not configured. OTP email was not sent.');
    return { skipped: true, emailSent: false };
  }

  const result = await resend.emails.send({
    from: env.resendFromEmail,
    to,
    subject: 'Twój kod weryfikacyjny – Coparentes',
    text:
      `Twój kod weryfikacyjny Coparentes: ${code}\n\n` +
      'Kod jest ważny przez 10 minut. Jeśli to nie Ty, zignoruj tę wiadomość.'
  });

  return { skipped: false, emailSent: true, result };
}
