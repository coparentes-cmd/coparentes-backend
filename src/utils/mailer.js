import { Resend } from 'resend';
import { env } from './env.js';

let resendClient = null;
let resendClientKey = null;

function resendApiKey() {
  return process.env.RESEND_API_KEY || env.resendApiKey || '';
}

function resendFromEmail() {
  return process.env.RESEND_FROM_EMAIL || env.resendFromEmail || '';
}

function getResendClient() {
  const key = resendApiKey();
  if (!key) {
    return null;
  }
  if (!resendClient || resendClientKey !== key) {
    resendClient = new Resend(key);
    resendClientKey = key;
  }
  return resendClient;
}

export function isEmailDeliveryConfigured() {
  return Boolean(resendApiKey() && resendFromEmail());
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

  const sendPromise = resend.emails.send({
    from: resendFromEmail(),
    to,
    subject,
    text,
    html
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        createMailerError(
          'email_send_timeout',
          'Email provider timed out after 8s'
        )
      );
    }, 8000);
  });

  const result = await Promise.race([sendPromise, timeoutPromise]);

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

export async function sendInviteEmail({
  to,
  acceptUrl,
  inviterEmail,
  inviteCode,
  workspaceName
}) {
  const safeCode = inviteCode ? String(inviteCode) : '';
  const safeWorkspace = workspaceName
    ? escapeHtml(workspaceName)
    : 'Coparentes';
  const codeBlock = safeCode
    ? `\nKod dołączenia do przestrzeni: ${safeCode}\n` +
      `W aplikacji wybierz Dołączanie i wpisz ten kod.\n`
    : '';
  const codeHtml = safeCode
    ? `<p style="margin: 20px 0;">
          <strong>Kod dołączenia:</strong>
          <span style="display:inline-block;margin-left:8px;padding:8px 12px;background:#F3F4F6;border-radius:8px;font-size:18px;letter-spacing:1px;font-weight:700;">${escapeHtml(safeCode)}</span>
        </p>
        <p>W aplikacji Coparentes wybierz zakładkę <strong>Dołączanie</strong> i wpisz ten kod.</p>`
    : '';

  try {
    return await dispatchEmail({
      to,
      subject: 'Zaproszenie do Coparentes',
      text:
        `Zaproszenie do Coparentes\n\n` +
        `${inviterEmail} zaprosił Cię do przestrzeni „${workspaceName || 'Coparentes'}”.\n` +
        codeBlock +
        `\nMożesz też zaakceptować zaproszenie linkiem (jeśli masz już konto): ${acceptUrl}\n\n` +
        'Jeśli to nie Ty, zignoruj tę wiadomość.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111111;">
          <h2 style="color: #00C896;">Zaproszenie do Coparentes</h2>
          <p>Użytkownik <strong>${escapeHtml(inviterEmail)}</strong> zaprosił Cię do przestrzeni <strong>${safeWorkspace}</strong>.</p>
          ${codeHtml}
          <p><a href="${escapeHtml(acceptUrl)}" style="color: #0080FF;">Lub kliknij tutaj, aby zaakceptować zaproszenie (gdy masz już konto)</a></p>
          <p style="color: #5F6673; font-size: 13px;">Jeśli to nie Ty, zignoruj tę wiadomość.</p>
        </div>
      `
    });
  } catch (error) {
    // Never fail the invite API solely because mail delivery is down —
    // the invite row (and join code) still exist for the client fallback.
    console.error('[mailer] sendInviteEmail soft-failed:', error?.code || error?.message);
    return {
      skipped: true,
      emailSent: false,
      error: error?.code || 'email_send_failed'
    };
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

export async function sendTempPasswordEmail({ to, tempPassword }) {
  const safePassword = escapeHtml(tempPassword);
  try {
    return await dispatchEmail({
      to,
      subject: 'Jednorazowe hasło – Coparentes',
      text:
        `Twoje jednorazowe hasło do Coparentes:\n\n` +
        `${tempPassword}\n\n` +
        `1. Zaloguj się tym hasłem na https://getcoparentes.app\n` +
        `2. Wejdź w Ustawienia → Zmień hasło\n` +
        `3. Ustaw własne, nowe hasło\n\n` +
        'Jeśli to nie Ty, zignoruj tę wiadomość i skontaktuj się z supportem.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111111; max-width: 520px;">
          <h2 style="color: #00C896; margin-bottom: 8px;">Coparentes</h2>
          <p>Oto Twoje <strong>jednorazowe hasło</strong> do logowania:</p>
          <p style="font-size: 22px; font-weight: 700; letter-spacing: 1px; margin: 16px 0; padding: 12px 16px; background: #F3F4F6; border-radius: 10px; display: inline-block;">${safePassword}</p>
          <ol style="color: #111111; padding-left: 18px;">
            <li>Zaloguj się tym hasłem w aplikacji</li>
            <li>Wejdź w <strong>Ustawienia → Zmień hasło</strong></li>
            <li>Ustaw własne, nowe hasło</li>
          </ol>
          <p style="color: #5F6673; font-size: 13px;">Jeśli to nie Ty, zignoruj tę wiadomość.</p>
        </div>
      `
    });
  } catch (error) {
    console.error(
      '[mailer] sendTempPasswordEmail failed:',
      error?.code || error?.message
    );
    return {
      skipped: true,
      emailSent: false,
      error: error?.code || 'email_send_failed'
    };
  }
}
