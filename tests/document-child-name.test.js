/**
 * Document list returns decrypted childName (not enc:v1: ciphertext).
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

const PASSWORD = 'DocChildName99!';
const CHILD_NAME = 'Zosia Testowa';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('Document childName decryption', { skip: !(await dbReady()) }, () => {
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
      await prisma.child.deleteMany({ where: { workspaceId: testWorkspaceId } });
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

  it('GET /documents returns plaintext childName, not enc:v1:', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'ChildName Parent',
        email: `doc-childname-${id}@test.coparentes.app`,
        password: PASSWORD,
        workspaceName: 'Rodzina ChildName Doc',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const token = register.json.token;

    const child = await request(server, 'POST', '/api/workspace/children', {
      token,
      body: {
        name: CHILD_NAME,
        dateOfBirth: '2016-05-12T00:00:00.000Z'
      }
    });
    assert.equal(child.status, 201, JSON.stringify(child.json));
    assert.equal(child.json.name, CHILD_NAME);

    const rawChild = await prisma.child.findUnique({
      where: { id: child.json.id },
      select: { name: true }
    });
    assert.ok(rawChild?.name?.startsWith('enc:v1:'), 'DB must store encrypted name');

    const pdfBytes = Buffer.from('%PDF-1.4\n%%EOF\n');
    const created = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'Świadectwo szkolne',
        category: 'School',
        childId: child.json.id,
        fileName: 'swiadectwo.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBytes.toString('base64')
      }
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.childId, child.json.id);
    assert.equal(created.json.childName, CHILD_NAME);
    assert.equal(String(created.json.childName).startsWith('enc:v1:'), false);

    const list = await request(server, 'GET', '/api/documents', { token });
    assert.equal(list.status, 200);
    const listed = (list.json.documents ?? []).find((d) => d.id === created.json.id);
    assert.ok(listed);
    assert.equal(listed.childName, CHILD_NAME);
    assert.equal(String(listed.childName).startsWith('enc:v1:'), false);
  });
});
