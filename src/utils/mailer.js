import { Resend } from 'resend';
import { env } from './env.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendInviteEmail({ to, acceptUrl, inviterEmail }) {
  if (!resend || !env.resendFromEmail) {
    console.warn('Resend is not configured. Skipping invite email send.');
    return { skipped: true };
  }

  return resend.emails.send({
    from: env.resendFromEmail,
    to,
    subject: 'Zaproszenie do Coparentes',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Zaproszenie do Coparentes</h2>
        <p>Użytkownik <strong>${inviterEmail}</strong> zaprosił Cię do połączenia kont w Coparentes.</p>
        <p><a href="${acceptUrl}">Kliknij tutaj, aby zaakceptować zaproszenie</a></p>
        <p>Jeśli to nie Ty, zignoruj tę wiadomość.</p>
      </div>
    `
  });
}
