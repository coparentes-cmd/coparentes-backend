/**
 * POST /auth/password can rotate passwordHash + privateKeyEnvelope + publicKey
 * atomically when the client supplies a fresh identity pair (orphaned envelope).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';
process.env.MAILER_STUB_SUCCESS = 'true';
process.env.RESEND_API_KEY ??= 're_test_stub_key';
process.env.RESEND_FROM_EMAIL ??= 'Coparentes <noreply@test.coparentes.app>';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';

const PASSWORD = 'Initial1!';
const NEW_PASSWORD = 'Changed9!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

function fakeX25519PublicKeyBase64() {
  return crypto.randomBytes(32).toString('base64');
}

describe(
  'POST /auth/password identity key replacement',
  { skip: !(await dbReady()) },
  () => {
    /** @type {import('node:http').Server} */
    let server;
    /** @type {string | null} */
    let workspaceId = null;
    /** @type {string} */
    let email;
    /** @type {string} */
    let userId;

    before(async () => {
      server = await listen(createApp());
      email = `pwd-replace-${Date.now()}@test.coparentes.app`;
    });

    after(async () => {
      server?.close();
      if (workspaceId) {
        await prisma.session.deleteMany({
          where: { user: { workspaceId } }
        });
        await prisma.userConsent.deleteMany({
          where: { user: { workspaceId } }
        });
        await prisma.user.deleteMany({ where: { workspaceId } });
        await prisma.workspace
          .delete({ where: { id: workspaceId } })
          .catch(() => {});
      }
      await prisma.$disconnect();
    });

    it('rejects newPublicKey without envelope; accepts atomic publicKey+envelope rotate', async () => {
      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Replace Keys User',
          email,
          password: PASSWORD,
          workspaceName: 'Replace Keys Family',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      workspaceId = register.json.workspace.id;
      userId = register.json.user.id;
      const token = register.json.token;

      const oldPublic = fakeX25519PublicKeyBase64();
      const oldEnvelope = `v1.opaque.old-${Date.now()}`;
      await prisma.user.update({
        where: { id: userId },
        data: {
          publicKey: oldPublic,
          privateKeyEnvelope: oldEnvelope
        }
      });

      const bad = await request(server, 'POST', '/api/auth/password', {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          newPublicKey: fakeX25519PublicKeyBase64()
          // missing newPrivateKeyEnvelope
        }
      });
      assert.equal(bad.status, 400, JSON.stringify(bad.json));
      assert.equal(bad.json.error, 'private_key_envelope_required');

      const stillOld = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          publicKey: true,
          privateKeyEnvelope: true,
          passwordHash: true
        }
      });
      assert.equal(stillOld?.publicKey, oldPublic);
      assert.equal(stillOld?.privateKeyEnvelope, oldEnvelope);
      assert.equal(await bcrypt.compare(PASSWORD, stillOld.passwordHash), true);

      const newPublic = fakeX25519PublicKeyBase64();
      const newEnvelope = `v1.opaque.new-${Date.now()}`;
      const ok = await request(server, 'POST', '/api/auth/password', {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          newPrivateKeyEnvelope: newEnvelope,
          newPublicKey: newPublic
        }
      });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));

      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          publicKey: true,
          privateKeyEnvelope: true,
          passwordHash: true,
          mustChangePassword: true
        }
      });
      assert.equal(after?.publicKey, newPublic);
      assert.equal(after?.privateKeyEnvelope, newEnvelope);
      assert.equal(after?.mustChangePassword, false);
      assert.equal(await bcrypt.compare(NEW_PASSWORD, after.passwordHash), true);
      assert.equal(await bcrypt.compare(PASSWORD, after.passwordHash), false);

      const login = await request(server, 'POST', '/api/auth/login', {
        body: { email, password: NEW_PASSWORD }
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
    });

    it('rejects invalid newPublicKey', async () => {
      const login = await request(server, 'POST', '/api/auth/login', {
        body: { email, password: NEW_PASSWORD }
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
      const token = login.json.token;

      const badKey = await request(server, 'POST', '/api/auth/password', {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          currentPassword: NEW_PASSWORD,
          newPassword: 'Another9!',
          newPrivateKeyEnvelope: 'v1.opaque.whatever',
          newPublicKey: 'not-valid-base64!!!'
        }
      });
      assert.equal(badKey.status, 400, JSON.stringify(badKey.json));
      assert.equal(badKey.json.error, 'invalid_public_key');
    });
  }
);
