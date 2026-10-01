/**
 * POST /api/user/keys — optional currentPassword gate + overwrite behaviour.
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

const PASSWORD = 'KeysPass1!';

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
  'POST /api/user/keys optional currentPassword',
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
      email = `user-keys-${Date.now()}@test.coparentes.app`;

      const register = await request(server, 'POST', '/api/auth/register', {
        body: {
          name: 'Keys User',
          email,
          password: PASSWORD,
          workspaceName: 'Keys Family',
          consents
        }
      });
      assert.equal(register.status, 201, JSON.stringify(register.json));
      token = register.json.token;
      userId = register.json.user.id;
      workspaceId = register.json.workspace.id;

      const first = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope('initial')
        }
      });
      assert.equal(first.status, 200, JSON.stringify(first.json));
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

    it('without currentPassword: overwrite succeeds (bootstrap / legacy path)', async () => {
      const before = await prisma.user.findUnique({
        where: { id: userId },
        select: { publicKey: true, privateKeyEnvelope: true }
      });
      assert.ok(before?.privateKeyEnvelope);

      const nextPublic = fakeX25519PublicKeyBase64();
      const nextEnvelope = fakeEnvelope('no-password');
      const res = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: nextPublic,
          privateKeyEnvelope: nextEnvelope
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, true);

      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { publicKey: true, privateKeyEnvelope: true }
      });
      assert.equal(after?.publicKey, nextPublic);
      assert.equal(after?.privateKeyEnvelope, nextEnvelope);
    });

    it('with correct currentPassword: overwrite succeeds', async () => {
      const nextPublic = fakeX25519PublicKeyBase64();
      const nextEnvelope = fakeEnvelope('with-password-ok');
      const res = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: nextPublic,
          privateKeyEnvelope: nextEnvelope,
          currentPassword: PASSWORD
        }
      });
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, true);

      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { publicKey: true, privateKeyEnvelope: true }
      });
      assert.equal(after?.publicKey, nextPublic);
      assert.equal(after?.privateKeyEnvelope, nextEnvelope);
    });

    it('with wrong currentPassword: 401 and keys unchanged', async () => {
      const before = await prisma.user.findUnique({
        where: { id: userId },
        select: { publicKey: true, privateKeyEnvelope: true }
      });

      const res = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope('should-not-land'),
          currentPassword: 'WrongPass9!'
        }
      });
      assert.equal(res.status, 401, JSON.stringify(res.json));
      assert.equal(res.json.error, 'invalid_credentials');

      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { publicKey: true, privateKeyEnvelope: true }
      });
      assert.equal(after?.publicKey, before?.publicKey);
      assert.equal(after?.privateKeyEnvelope, before?.privateKeyEnvelope);
    });
  }
);
