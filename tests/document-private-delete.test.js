/**
 * Private-only hard delete for documents.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'false';
process.env.OTP_ENABLED = 'false';

import { createApp } from '../src/createApp.js';
import { listen, request, dbReady } from './helpers/http.js';
import { prisma } from '../src/lib/prisma.js';
import { PRIVATE_DOCUMENT_CATEGORY } from '../src/services/documents.js';

const PASSWORD = 'DocDeletePrivate99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

const pdfBase64 = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');

describe('Document private delete', { skip: !(await dbReady()) }, () => {
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

  it('B cannot delete A private; A can; shared School cannot be deleted', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Doc Del Anna',
        email: `doc-del-a-${id}@test.coparentes.app`,
        password: PASSWORD,
        workspaceName: 'Rodzina Doc Delete',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const tokenA = register.json.token;
    const inviteCode = register.json.workspace.inviteCode;

    const join = await request(server, 'POST', '/api/auth/join', {
      body: {
        name: 'Doc Del Marek',
        email: `doc-del-b-${id}@test.coparentes.app`,
        password: PASSWORD,
        inviteCode,
        role: 'parentB'
      }
    });
    assert.equal(join.status, 201, JSON.stringify(join.json));
    const tokenB = join.json.token;

    assert.equal(PRIVATE_DOCUMENT_CATEGORY, 'Private');

    const privateDoc = await request(server, 'POST', '/api/documents', {
      token: tokenA,
      body: {
        title: 'Prywatna notatka',
        category: PRIVATE_DOCUMENT_CATEGORY,
        fileName: 'prywatne.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBase64
      }
    });
    assert.equal(privateDoc.status, 201, JSON.stringify(privateDoc.json));
    const privateId = privateDoc.json.id;

    // Test 1: parent B cannot delete A's private doc
    const bDelete = await request(
      server,
      'DELETE',
      `/api/documents/${privateId}`,
      { token: tokenB }
    );
    assert.equal(bDelete.status, 403, JSON.stringify(bDelete.json));
    assert.equal(bDelete.json.error, 'forbidden');

    const stillThere = await prisma.document.findUnique({
      where: { id: privateId }
    });
    assert.ok(stillThere);

    // Test 2: parent A deletes own private doc
    const aDelete = await request(
      server,
      'DELETE',
      `/api/documents/${privateId}`,
      { token: tokenA }
    );
    assert.equal(aDelete.status, 200, JSON.stringify(aDelete.json));
    assert.equal(aDelete.json.ok, true);
    assert.equal(aDelete.json.id, privateId);

    const listAfter = await request(server, 'GET', '/api/documents', {
      token: tokenA
    });
    assert.equal(listAfter.status, 200);
    assert.equal(
      (listAfter.json.documents ?? []).some((d) => d.id === privateId),
      false
    );
    assert.equal(await prisma.document.findUnique({ where: { id: privateId } }), null);

    // Test 3: own shared (School) document cannot be deleted
    const schoolDoc = await request(server, 'POST', '/api/documents', {
      token: tokenA,
      body: {
        title: 'Świadectwo',
        category: 'School',
        fileName: 'school.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBase64
      }
    });
    assert.equal(schoolDoc.status, 201, JSON.stringify(schoolDoc.json));
    const schoolId = schoolDoc.json.id;

    const schoolDelete = await request(
      server,
      'DELETE',
      `/api/documents/${schoolId}`,
      { token: tokenA }
    );
    assert.equal(schoolDelete.status, 403, JSON.stringify(schoolDelete.json));
    assert.equal(schoolDelete.json.error, 'forbidden');
    assert.ok(await prisma.document.findUnique({ where: { id: schoolId } }));
  });
});
