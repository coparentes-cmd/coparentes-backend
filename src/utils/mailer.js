import { Resend } from 'resend';
import { env } from './env.js';

let resendClient = null;

function getResendClient() {
  if (!env.resendApiKey) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
}

export function isEmailDeliveryConfigured() {
  return Boolean(env.resendApiKey && env.resendFromEmail);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createMailerError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

async function dispatchEmail({ to, subject, text, html }) {
  const resend = getResendClient();
  if (!isEmailDeliveryConfigured() || !resend) {
    console.warn('[mailer] Resend is not configured — email was not sent.');
    throw createMailerError(
      'email_not_configured',
      'Email delivery is not configured'
    );
  }

  const result = await resend.emails.send({
    from: env.resendFromEmail,
    to,
    subject,
    text,
    html
  });

  if (result.error) {
    console.error('[mailer] Resend send failed:', result.error);
    throw createMailerError(
      'email_send_failed',
      result.error.message || 'Email send failed',
      result.error
    );
  }

  return {
    emailSent: true,
    id: result.data?.id ?? null
  };
}

export async function sendInviteEmail({ to, acceptUrl, inviterEmail }) {
  try {
    return await dispatchEmail({
      to,
      subject: 'Zaproszenie do Coparentes',
      text:
        `Zaproszenie do Coparentes\n\n` +
        `${inviterEmail} zaprosił Cię do połączenia kont w Coparentes.\n` +
        `Akceptuj zaproszenie: ${acceptUrl}\n\n` +
        'Jeśli to nie Ty, zignoruj tę wiadomość.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111111;">
          <h2 style="color: #00C896;">Zaproszenie do Coparentes</h2>
          <p>Użytkownik <strong>${escapeHtml(inviterEmail)}</strong> zaprosił Cię do połączenia kont w Coparentes.</p>
          <p><a href="${escapeHtml(acceptUrl)}" style="color: #0080FF;">Kliknij tutaj, aby zaakceptować zaproszenie</a></p>
          <p style="color: #5F6673; font-size: 13px;">Jeśli to nie Ty, zignoruj tę wiadomość.</p>
        </div>
      `
    });
  } catch (error) {
    if (error.code === 'email_not_configured') {
      return { skipped: true, emailSent: false };
    }
    throw error;
  }
}

export async function sendOtpEmail({ to, code }) {
  const safeCode = escapeHtml(code);
  const ttl = env.otpTtlMinutes;

  return dispatchEmail({
    to,
    subject: 'Twój kod weryfikacyjny – Coparentes',
    text:
      `Twój kod weryfikacyjny Coparentes: ${code}\n\n` +
      `Kod jest ważny przez ${ttl} minut. Jeśli to nie Ty, zignoruj tę wiadomość.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111111; max-width: 520px;">
        <h2 style="color: #00C896; margin-bottom: 8px;">Coparentes</h2>
        <p>Twój kod weryfikacyjny logowania:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 16px 0; color: #111111;">${safeCode}</p>
        <p style="color: #5F6673; font-size: 14px;">Kod jest ważny przez ${ttl} minut.</p>
        <p style="color: #5F6673; font-size: 13px;">Jeśli to nie Ty, zignoruj tę wiadomość.</p>
      </div>
    `
  });
}
