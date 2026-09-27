/**
 * Workspace document quota: count (200) OR storage (100 MB decoded), whichever first.
 * Unit tests for assertWorkspaceDocumentQuota + one HTTP e2e for storage limit.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';

import {
  assertWorkspaceDocumentQuota,
  WORKSPACE_DOCUMENT_COUNT_LIMIT,
  WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES
} from '../src/services/documents.js';
import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';

const PASSWORD = 'DocQuota99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

const pdfBase64 = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');

describe('assertWorkspaceDocumentQuota (unit)', () => {
  it('throws workspace_document_limit_reached when count >= 200', () => {
    assert.throws(
      () =>
        assertWorkspaceDocumentQuota({
          existingCount: WORKSPACE_DOCUMENT_COUNT_LIMIT,
          existingBytes: 0,
          incomingBytes: 1
        }),
      (err) => err.code === 'workspace_document_limit_reached'
    );
  });

  it('passes when count is 199', () => {
    assert.doesNotThrow(() =>
      assertWorkspaceDocumentQuota({
        existingCount: WORKSPACE_DOCUMENT_COUNT_LIMIT - 1,
        existingBytes: 0,
        incomingBytes: 1
      })
    );
  });

  it('throws workspace_storage_limit_reached when sum + new > 100MB', () => {
    assert.throws(
      () =>
        assertWorkspaceDocumentQuota({
          existingCount: 1,
          existingBytes: WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES - 10,
          incomingBytes: 11
        }),
      (err) => err.code === 'workspace_storage_limit_reached'
    );
  });

  it('passes when sum + new <= 100MB', () => {
    assert.doesNotThrow(() =>
      assertWorkspaceDocumentQuota({
        existingCount: 1,
        existingBytes: WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES - 10,
        incomingBytes: 10
      })
    );
  });

  it('count limit takes precedence over storage when both would fail', () => {
    assert.throws(
      () =>
        assertWorkspaceDocumentQuota({
          existingCount: WORKSPACE_DOCUMENT_COUNT_LIMIT,
          existingBytes: WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES,
          incomingBytes: 1
        }),
      (err) => err.code === 'workspace_document_limit_reached'
    );
  });
});

describe('Document workspace quota (e2e)', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string | null} */
  let testWorkspaceId = null;

  before(async () => {
    server = await listen(createApp());
  });

  after(async () => {
    server?.close();
    if (testWorkspaceId) {
      await prisma.document.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.session.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.userConsent.deleteMany({
        where: { user: { workspaceId: testWorkspaceId } }
      });
      await prisma.emailInvite.deleteMany({
        where: { workspaceId: testWorkspaceId }
      });
      await prisma.user.deleteMany({ where: { workspaceId: testWorkspaceId } });
      await prisma.workspace.delete({ where: { id: testWorkspaceId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('rejects upload when workspace storage would exceed 100MB (413)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Doc Quota Anna',
        email: `doc-quota-a-${id}@test.coparentes.app`,
        password: PASSWORD,
        workspaceName: 'Rodzina Doc Quota',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const token = register.json.token;
    const userId = register.json.user.id;

    // Seed one document row with sizeBytes just under the limit (no huge payload).
    const seeded = await prisma.document.create({
      data: {
        workspaceId: testWorkspaceId,
        uploadedById: userId,
        title: 'Seed bulky',
        category: 'Private',
        fileName: 'seed.pdf',
        mimeType: 'application/pdf',
        contentBase64: null,
        fileUrl: null,
        sizeBytes: WORKSPACE_DOCUMENT_STORAGE_LIMIT_BYTES - 5
      }
    });
    assert.ok(seeded.id);

    const overflow = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'Overflow',
        category: 'Private',
        fileName: 'overflow.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBase64
      }
    });

    assert.equal(overflow.status, 413, JSON.stringify(overflow.json));
    assert.equal(overflow.json.error, 'workspace_storage_limit_reached');

    const count = await prisma.document.count({
      where: { workspaceId: testWorkspaceId }
    });
    assert.equal(count, 1);
  });
});
