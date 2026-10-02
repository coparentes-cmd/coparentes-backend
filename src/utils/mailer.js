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

/** Masked From address for /api/ready (no secrets). */
export function getEmailFromSummary() {
  const from = resendFromEmail();
  if (!from) {
    return null;
  }
  const match = from.match(/@([^>]+)>?/);
  const domain = match?.[1]?.trim() || null;
  const key = resendApiKey();
  return {
    configured: true,
    fromDomain: domain,
    keyPrefix: key ? key.slice(0, 5) : null
  };
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

const EMAIL_SEND_TIMEOUT_MS = 30000;

async function dispatchEmail({ to, subject, text, html }) {
  // Integration tests: skip real Resend; never log subject/html/text.
  if (process.env.MAILER_STUB_SUCCESS === 'true') {
    return { emailSent: true, id: 'mailer-stub-id' };
  }

  const resend = getResendClient();
  if (!isEmailDeliveryConfigured() || !resend) {
    console.warn('[mailer] Resend is not configured — email was not sent.');
    throw createMailerError(
      'email_not_configured',
      'Email delivery is not configured'
    );
  }

  const recipients = Array.isArray(to) ? to : [to];
  let timeoutId;

  try {
    const sendPromise = resend.emails.send({
      from: resendFromEmail(),
      to: recipients,
      subject,
      text,
      html
    });

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          createMailerError(
            'email_send_timeout',
            `Email provider timed out after ${EMAIL_SEND_TIMEOUT_MS / 1000}s`
          )
        );
      }, EMAIL_SEND_TIMEOUT_MS);
    });

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (result?.error) {
      console.error('[mailer] Resend send failed:', result.error);
      throw createMailerError(
        'email_send_failed',
        result.error.message || 'Email send failed',
        result.error
      );
    }

    const id = result?.data?.id ?? null;
    if (!id) {
      console.error('[mailer] Resend returned no message id:', result);
      throw createMailerError(
        'email_send_failed',
        'Email provider returned no message id'
      );
    }

    return {
      emailSent: true,
      id
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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

/** Last password-reset raw token when MAILER_STUB_SUCCESS=true (tests only). */
let stubLastPasswordResetToken = null;

/** @returns {string | null} */
export function getStubLastPasswordResetToken() {
  return stubLastPasswordResetToken;
}

/** @type {string[] | null} */
let stubLastPasswordResetRecipients = null;

/** @returns {string[] | null} last `to` list under stub (tests) */
export function getStubLastPasswordResetRecipients() {
  return stubLastPasswordResetRecipients == null
    ? null
    : [...stubLastPasswordResetRecipients];
}

export async function sendPasswordResetLinkEmail({
  to,
  resetUrl,
  childName = null
}) {
  const recipients = Array.isArray(to) ? [...to] : [to];
  if (process.env.MAILER_STUB_SUCCESS === 'true') {
    try {
      stubLastPasswordResetToken = new URL(resetUrl).searchParams.get('token');
    } catch {
      stubLastPasswordResetToken = null;
    }
    stubLastPasswordResetRecipients = recipients.map((r) => String(r));
  }
  const safeUrl = escapeHtml(resetUrl);
  const forChild = typeof childName === 'string' && childName.trim().length > 0;
  const trimmedChild = forChild ? childName.trim() : '';
  const safeChild = forChild ? escapeHtml(trimmedChild) : '';

  const subject = forChild
    ? `Reset hasła - konto: ${trimmedChild} - Coparentes`
    : 'Reset hasła – Coparentes';

  const contextLine = forChild
    ? `To jest reset hasła dla konta dziecka: ${trimmedChild}. Oboje rodzice otrzymują tę wiadomość.\n\n`
    : '';
  const contextHtml = forChild
    ? `<p>To jest reset hasła dla konta dziecka: <strong>${safeChild}</strong>. Oboje rodzice otrzymują tę wiadomość.</p>`
    : '';
  const introLine = forChild
    ? ''
    : 'Otrzymaliśmy prośbę o reset hasła w Coparentes.\n\n';
  const introHtml = forChild
    ? ''
    : '<p>Otrzymaliśmy prośbę o reset hasła.</p>';

  try {
    return await dispatchEmail({
      to: recipients,
      subject,
      text:
        contextLine +
        introLine +
        `Otwórz ten link (ważny 1 godzinę):\n${resetUrl}\n\n` +
        `Jeśli to nie Ty, zignoruj tę wiadomość — hasło nie zostanie zmienione.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111111; max-width: 520px;">
          <h2 style="color: #00C896; margin-bottom: 8px;">Coparentes</h2>
          ${contextHtml}
          ${introHtml}
          <p style="margin: 20px 0;">
            <a href="${safeUrl}" style="display: inline-block; background: #00C896; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Ustaw nowe hasło</a>
          </p>
          <p style="color: #5F6673; font-size: 13px;">Link jest ważny przez 1 godzinę. Jeśli to nie Ty, zignoruj tę wiadomość — hasło nie zostanie zmienione.</p>
        </div>
      `
    });
  } catch (error) {
    console.error(
      '[mailer] sendPasswordResetLinkEmail failed:',
      error?.code || error?.message,
      error?.details || ''
    );
    return {
      skipped: true,
      emailSent: false,
      error: error?.code || 'email_send_failed',
      details: error?.details || null,
      message: error?.message || null
    };
  }
}

/** Last recovery code when MAILER_STUB_SUCCESS=true (tests only). */
let stubLastRecoveryCode = null;

/** @type {string[] | null} */
let stubLastRecoveryRecipients = null;

/** @returns {string | null} */
export function getStubLastRecoveryCode() {
  return stubLastRecoveryCode;
}

/** @returns {string[] | null} last `to` list passed to sendRecoveryCodeEmail under stub */
export function getStubLastRecoveryRecipients() {
  return stubLastRecoveryRecipients == null
    ? null
    : [...stubLastRecoveryRecipients];
}

export async function sendRecoveryCodeEmail({
  to,
  recoveryCode,
  childName = null
}) {
  const recipients = Array.isArray(to) ? [...to] : [to];
  if (process.env.MAILER_STUB_SUCCESS === 'true') {
    stubLastRecoveryCode = recoveryCode != null ? String(recoveryCode) : null;
    stubLastRecoveryRecipients = recipients.map((r) => String(r));
  }
  const safeCode = escapeHtml(recoveryCode);
  const forChild = typeof childName === 'string' && childName.trim().length > 0;
  const trimmedChild = forChild ? childName.trim() : '';
  const safeChild = forChild ? escapeHtml(trimmedChild) : '';

  const subject = forChild
    ? `Kod odzyskiwania czatu - konto: ${trimmedChild} - Coparentes`
    : 'Kod odzyskiwania czatu – Coparentes';

  const contextLine = forChild
    ? `To jest kod odzyskiwania dla konta dziecka: ${trimmedChild}. Oboje rodzice otrzymują tę wiadomość.\n\n`
    : '';
  const contextHtml = forChild
    ? `<p>To jest kod odzyskiwania dla konta dziecka: <strong>${safeChild}</strong>. Oboje rodzice otrzymują tę wiadomość.</p>`
    : '';

  try {
    return await dispatchEmail({
      to: recipients,
      subject,
      text:
        contextLine +
        `Twój kod odzyskiwania historii czatu Coparentes:\n\n` +
        `${recoveryCode}\n\n` +
        `Zachowaj ten kod w bezpiecznym miejscu i nie przekazuj go nikomu — ` +
        `pozwoli odzyskać historię czatu, jeśli zapomnisz hasła.\n\n` +
        `Jeśli to nie Ty, zignoruj tę wiadomość.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111111; max-width: 520px;">
          <h2 style="color: #00C896; margin-bottom: 8px;">Coparentes</h2>
          ${contextHtml}
          <p>Twój kod odzyskiwania historii czatu:</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0; color: #111111; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">${safeCode}</p>
          <p style="color: #B45309; font-size: 14px;"><strong>Zachowaj ten kod w bezpiecznym miejscu</strong> i nie przekazuj go nikomu — pozwoli odzyskać historię czatu, jeśli zapomnisz hasła.</p>
          <p style="color: #5F6673; font-size: 13px;">Jeśli to nie Ty, zignoruj tę wiadomość.</p>
        </div>
      `
    });
  } catch (error) {
    console.error(
      '[mailer] sendRecoveryCodeEmail failed:',
      error?.code || error?.message,
      error?.details || ''
    );
    return {
      skipped: true,
      emailSent: false,
      error: error?.code || 'email_send_failed',
      details: error?.details || null,
      message: error?.message || null
    };
  }
}

/** Kept for unit smoke tests of mail soft-fail; no longer used by auth reset flow. */
export async function sendTempPasswordEmail({ to, tempPassword }) {
  const safePassword = escapeHtml(tempPassword);
  try {
    return await dispatchEmail({
      to,
      subject: 'Jednorazowe hasło – Coparentes',
      text:
        `Twoje jednorazowe hasło do Coparentes (12 cyfr):\n\n` +
        `${tempPassword}\n\n` +
        `Ważne: użyj TYLKO najnowszego maila. Skopiuj same cyfry, bez spacji.\n` +
        `1. Zaloguj się na https://getcoparentes.app\n` +
        `2. Ustawienia → Zmień hasło\n\n` +
        'Jeśli to nie Ty, zignoruj tę wiadomość.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111111; max-width: 520px;">
          <h2 style="color: #00C896; margin-bottom: 8px;">Coparentes</h2>
          <p>Twoje jednorazowe hasło (12 cyfr):</p>
          <pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 28px; font-weight: 700; letter-spacing: normal; margin: 16px 0; padding: 16px; background: #F3F4F6; border-radius: 10px; text-align: center; user-select: all;">${safePassword}</pre>
          <p style="color: #B45309; font-size: 14px;"><strong>Użyj tylko najnowszego maila.</strong> Skopiuj same cyfry, bez spacji.</p>
          <ol style="color: #111111; padding-left: 18px;">
            <li>Zaloguj się tym hasłem w aplikacji</li>
            <li>Wejdź w <strong>Ustawienia → Zmień hasło</strong></li>
          </ol>
        </div>
      `
    });
  } catch (error) {
    console.error(
      '[mailer] sendTempPasswordEmail failed:',
      error?.code || error?.message,
      error?.details || ''
    );
    return {
      skipped: true,
      emailSent: false,
      error: error?.code || 'email_send_failed',
      details: error?.details || null,
      message: error?.message || null
    };
  }
}
