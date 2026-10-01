/**
 * R5: rate limits on POST /api/user/keys (with currentPassword) and
 * POST /api/user/recovery-key.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
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
import { resetUserRateLimitersForTests } from '../src/routes/user.js';

const PASSWORD = 'RateLimitKeys1!';
const RATE_MSG = 'Too many requests, try again later';

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
    kdf: {
      algo: 'argon2id',
      salt: 'dGVzdA==',
      memory: 64,
      iterations: 1,
      parallelism: 1
    },
    cipher: {
      algo: 'aes256gcm',
      nonce: 'dGVzdA==',
      ciphertext: 'dGVzdA=='
    }
  });
}

function isRateLimited(res) {
  return res.status === 429 && res.json?.error === RATE_MSG;
}

describe('R5 user E2E rate limits', { skip: !(await dbReady()) }, () => {
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
  });

  after(async () => {
    if (workspaceId) {
      await prisma.workspace
        .delete({ where: { id: workspaceId } })
        .catch(() => {});
    }
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(async () => {
    await resetUserRateLimitersForTests();
    if (workspaceId) {
      await prisma.workspace
        .delete({ where: { id: workspaceId } })
        .catch(() => {});
      workspaceId = null;
    }

    email = `r5-rate-${Date.now()}-${Math.random().toString(16).slice(2)}@test.coparentes.app`;
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'R5 Rate User',
        email,
        password: PASSWORD,
        workspaceName: 'R5 Rate Family',
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
        privateKeyEnvelope: fakeEnvelope('bootstrap')
      }
    });
    assert.equal(first.status, 200, JSON.stringify(first.json));
  });

  it('POST /keys without currentPassword is not rate-limited (skip)', async () => {
    for (let i = 0; i < 8; i += 1) {
      const res = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope(`no-pw-${i}`)
        }
      });
      assert.equal(isRateLimited(res), false, `attempt ${i + 1}`);
      assert.equal(res.status, 200, JSON.stringify(res.json));
    }
  });

  it('POST /keys with currentPassword: 5 allowed, 6th is 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope(`pw-${i}`),
          currentPassword: 'WrongPass9!'
        }
      });
      assert.equal(isRateLimited(res), false, `attempt ${i + 1}`);
      assert.equal(res.status, 401);
      assert.equal(res.json?.error, 'invalid_credentials');
    }

    const sixth = await request(server, 'POST', '/api/user/keys', {
      token,
      body: {
        publicKey: fakeX25519PublicKeyBase64(),
        privateKeyEnvelope: fakeEnvelope('pw-6'),
        currentPassword: 'WrongPass9!'
      }
    });
    assert.equal(isRateLimited(sixth), true);

    // Correct password also blocked once quota exhausted.
    const blockedOk = await request(server, 'POST', '/api/user/keys', {
      token,
      body: {
        publicKey: fakeX25519PublicKeyBase64(),
        privateKeyEnvelope: fakeEnvelope('pw-blocked'),
        currentPassword: PASSWORD
      }
    });
    assert.equal(isRateLimited(blockedOk), true);

    // Bootstrap without password still works (skip).
    const bootstrap = await request(server, 'POST', '/api/user/keys', {
      token,
      body: {
        publicKey: fakeX25519PublicKeyBase64(),
        privateKeyEnvelope: fakeEnvelope('still-ok')
      }
    });
    assert.equal(isRateLimited(bootstrap), false);
    assert.equal(bootstrap.status, 200);
  });

  it('POST /recovery-key: 5 allowed, 6th is 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      const code = createRecoveryCode();
      const res = await request(server, 'POST', '/api/user/recovery-key', {
        token,
        body: {
          recoveryKeyEnvelope: fakeEnvelope(`rec-${i}`),
          recoveryCode: code
        }
      });
      assert.equal(isRateLimited(res), false, `attempt ${i + 1}`);
      assert.equal(res.status, 200, JSON.stringify(res.json));
    }

    const sixth = await request(server, 'POST', '/api/user/recovery-key', {
      token,
      body: {
        recoveryKeyEnvelope: fakeEnvelope('rec-6'),
        recoveryCode: createRecoveryCode()
      }
    });
    assert.equal(isRateLimited(sixth), true);
  });

  it('rate limits are isolated per userId', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server, 'POST', '/api/user/keys', {
        token,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope(`u1-${i}`),
          currentPassword: 'WrongPass9!'
        }
      });
      assert.equal(res.status, 401);
    }
    const blocked = await request(server, 'POST', '/api/user/keys', {
      token,
      body: {
        publicKey: fakeX25519PublicKeyBase64(),
        privateKeyEnvelope: fakeEnvelope('u1-block'),
        currentPassword: 'WrongPass9!'
      }
    });
    assert.equal(isRateLimited(blocked), true);

    const email2 = `r5-rate-b-${Date.now()}@test.coparentes.app`;
    const register2 = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'R5 Other',
        email: email2,
        password: PASSWORD,
        workspaceName: 'R5 Other Family',
        consents
      }
    });
    assert.equal(register2.status, 201);
    const token2 = register2.json.token;
    const workspaceId2 = register2.json.workspace.id;

    try {
      const other = await request(server, 'POST', '/api/user/keys', {
        token: token2,
        body: {
          publicKey: fakeX25519PublicKeyBase64(),
          privateKeyEnvelope: fakeEnvelope('u2'),
          currentPassword: PASSWORD
        }
      });
      assert.equal(isRateLimited(other), false);
      assert.equal(other.status, 200, JSON.stringify(other.json));
    } finally {
      await prisma.workspace
        .delete({ where: { id: workspaceId2 } })
        .catch(() => {});
    }

    void userId;
  });
});
