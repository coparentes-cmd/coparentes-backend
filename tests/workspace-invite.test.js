import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/coparentes_test';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.PARENT_INVITE_TTL_HOURS = '24';

const {
  parentInviteExpiresAt,
  isParentInviteExpired
} = await import('../src/services/workspace.js');

describe('parent invite expiry', () => {
  it('expires parent invite after configured TTL', () => {
    const createdAt = new Date('2026-06-12T10:00:00.000Z');
    const expiresAt = parentInviteExpiresAt(createdAt);
    assert.equal(expiresAt.toISOString(), '2026-06-13T10:00:00.000Z');
  });

  it('detects expired and valid invite windows', () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    assert.equal(isParentInviteExpired({ inviteCodeExpiresAt: expiresAt }), false);
    assert.equal(
      isParentInviteExpired({ inviteCodeExpiresAt: new Date(Date.now() - 1000) }),
      true
    );
    assert.equal(isParentInviteExpired({ inviteCodeExpiresAt: null }), true);
  });
});
