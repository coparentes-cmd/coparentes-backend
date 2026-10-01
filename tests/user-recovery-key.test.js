/**
 * POST /api/user/recovery-key + GET /api/user/keys/mine recoveryKeyEnvelope.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
import { createRecoveryCode } from '../src/utils/security.js';
import { getStubLastRecoveryCode } from '../src/utils/mailer.js';

const PASSWORD = 'RecoveryKey1!';

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

function fakeEnvelope(tag) {
  return JSON.stringify({
    v: 1,
    tag,
    kdf: { algo: 'argon2id', salt: 'dGVzdA==', memory: 64, iterations: 1, parallelism: 1 },
    cipher: { algo: 'aes256gcm', nonce: 'dGVzdA==', ciphertext: 'dGVzdA==' }
  });
}

describe(
  'POST /api/user/recovery-key',
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
    /** @type {string} */
    let token;

    before(async () => {
      server = await listen(createApp());
      email = `recovery-key-${Date.now()}@test.coparentes.app`;

      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Recovery User',
          email,
          password: PASSWORD,
          workspaceName: 'Recovery Family',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      token = register.json.token;
      userId = register.json.user.id;
      workspaceId = register.json.workspace.id;

      const keys = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope('password')
        }
      });
      assert.equal(keys.status, 200, JSON.stringify(keys.json));
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

    it('requires Bearer', async () => {
      const res = await request(server, 'POST', '/api/user/recovery-key', {
        body: {
          recoveryKeyEnvelope: fakeEnvelope('recovery'),
          recoveryCode: createRecoveryCode()
        }
      });
      assert.equal(res.status, 401);
    });

    it('rejects invalid body', async () => {
      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token,
        body: { recoveryKeyEnvelope: 'x' }
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.error, 'invalid_request');
    });

    it('stores envelope, e-mails code, and exposes envelope on keys/mine', async () => {
      const code = createRecoveryCode();
      const envelope = fakeEnvelope('recovery-v1');

      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token,
        body: {
          recoveryKeyEnvelope: envelope,
          recoveryCode: code
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, true);
      assert.equal(getStubLastRecoveryCode(), code);

      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { recoveryKeyEnvelope: true }
      });
      assert.equal(row?.recoveryKeyEnvelope, envelope);

      const mine = await request(server, 'GET', '/api/user/keys/mine', {
        token
      });
      assert.equal(mine.status, 200, JSON.stringify(mine.json));
      assert.equal(mine.json.privateKeyEnvelope, fakeEnvelope('password'));
      assert.equal(mine.json.recoveryKeyEnvelope, envelope);
      assert.equal(Object.hasOwn(mine.json, 'recoveryCode'), false);
    });

    it('overwrite replaces previous recovery envelope', async () => {
      const code = createRecoveryCode();
      const envelope = fakeEnvelope('recovery-v2');

      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token,
        body: {
          recoveryKeyEnvelope: envelope,
          recoveryCode: code
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(getStubLastRecoveryCode(), code);

      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { recoveryKeyEnvelope: true }
      });
      assert.equal(row?.recoveryKeyEnvelope, envelope);
    });
  }
);
