/**
 * Document upload: magic-byte file type allowlist.
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
import {
  detectFileTypeFromBase64,
  assertAllowedDocumentContent,
  looksLikePlainText
} from '../src/utils/fileSignature.js';

const PASSWORD = 'DocSignature99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('detectFileTypeFromBase64', () => {
  it('detects PDF, JPEG, PNG, EXE-null', () => {
    assert.equal(
      detectFileTypeFromBase64(Buffer.from('%PDF-1.4\n%âãÏÓ\n').toString('base64')),
      'pdf'
    );
    assert.equal(
      detectFileTypeFromBase64(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64')),
      'jpeg'
    );
    assert.equal(
      detectFileTypeFromBase64(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')
      ),
      'png'
    );
    // MZ = DOS/Windows executable
    assert.equal(
      detectFileTypeFromBase64(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]).toString('base64')),
      null
    );
  });

  it('allows TXT claim without magic bytes; rejects bare random bytes', () => {
    const random = Buffer.from('hello world plain text content').toString('base64');
    assert.equal(detectFileTypeFromBase64(random), null);
    assert.equal(
      assertAllowedDocumentContent(random, {
        fileName: 'notes.txt',
        mimeType: 'text/plain'
      }),
      'txt'
    );
    assert.throws(
      () =>
        assertAllowedDocumentContent(random, {
          fileName: 'payload.bin',
          mimeType: 'application/octet-stream'
        }),
      (err) => err.code === 'unsupported_file_type'
    );
  });

  it('rejects binary (MZ exe) even when claimed as text/plain / .txt', () => {
    const exeBytes = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
      0xff, 0xff, 0x00, 0x00
    ]);
    assert.equal(detectFileTypeFromBase64(exeBytes.toString('base64')), null);
    assert.equal(looksLikePlainText(exeBytes), false);
    assert.throws(
      () =>
        assertAllowedDocumentContent(exeBytes.toString('base64'), {
          fileName: 'notes.txt',
          mimeType: 'text/plain'
        }),
      (err) => err.code === 'unsupported_file_type'
    );
  });

  it('allows UTF-8 Polish plain text under TXT claim', () => {
    const polish = Buffer.from('Notatka: łódź, żółć, ąćęłńóśźż\n', 'utf8');
    assert.equal(looksLikePlainText(polish), true);
    assert.equal(
      assertAllowedDocumentContent(polish.toString('base64'), {
        fileName: 'notatka.txt',
        mimeType: 'text/plain'
      }),
      'txt'
    );
  });
});

describe('Document upload file signature (API)', { skip: !(await dbReady()) }, () => {
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

  it('accepts PDF magic bytes (201); rejects MZ executable (400 unsupported_file_type)', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Doc Sig Parent',
        email: `doc-sig-${id}@test.coparentes.app`,
        password: PASSWORD,
        workspaceName: 'Rodzina Doc Signature',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const token = register.json.token;

    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n'
    );
    const pdfOk = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'Umowa PDF',
        category: 'Agreements',
        fileName: 'umowa.pdf',
        mimeType: 'application/pdf',
        contentBase64: pdfBytes.toString('base64')
      }
    });
    assert.equal(pdfOk.status, 201, JSON.stringify(pdfOk.json));
    assert.equal(pdfOk.json.title, 'Umowa PDF');
    assert.equal(pdfOk.json.hasFile, true);

    // MZ executable header — must not be accepted even with fake pdf mime
    const exeBytes = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
      0xff, 0xff, 0x00, 0x00
    ]);
    const exeReject = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'Not a document',
        category: 'Shared',
        fileName: 'malware.exe',
        mimeType: 'application/pdf',
        contentBase64: exeBytes.toString('base64')
      }
    });
    assert.equal(exeReject.status, 400, JSON.stringify(exeReject.json));
    assert.equal(exeReject.json.error, 'unsupported_file_type');

    const randomReject = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'Losowe bajty',
        category: 'Shared',
        fileName: 'random.bin',
        mimeType: 'application/octet-stream',
        contentBase64: Buffer.from('not-a-real-file-format!!!!').toString('base64')
      }
    });
    assert.equal(randomReject.status, 400);
    assert.equal(randomReject.json.error, 'unsupported_file_type');

    // Binary disguised as TXT must still be rejected
    const exeAsTxt = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'Fake txt',
        category: 'Shared',
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        contentBase64: exeBytes.toString('base64')
      }
    });
    assert.equal(exeAsTxt.status, 400, JSON.stringify(exeAsTxt.json));
    assert.equal(exeAsTxt.json.error, 'unsupported_file_type');
  });

  it('ignores client fileUrl on create — DB stores null', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Doc NoUrl Parent',
        email: `doc-nourl-${id}@test.coparentes.app`,
        password: PASSWORD,
        workspaceName: 'Rodzina Doc NoUrl',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    // Prefer reusing workspace from prior test when present; otherwise set for cleanup.
    testWorkspaceId = testWorkspaceId ?? register.json.workspace.id;
    const token = register.json.token;
    const workspaceId = register.json.workspace.id;

    const pdfBytes = Buffer.from('%PDF-1.4\n%%EOF\n');
    const evilUrl = 'https://evil.example.com/huge-file';
    const created = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'With spoofed fileUrl',
        category: 'Shared',
        fileName: 'ok.pdf',
        mimeType: 'application/pdf',
        fileUrl: evilUrl,
        contentBase64: pdfBytes.toString('base64')
      }
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.fileUrl, null);

    const row = await prisma.document.findUnique({
      where: { id: created.json.id },
      select: { fileUrl: true, workspaceId: true }
    });
    assert.ok(row);
    assert.equal(row.fileUrl, null);
    assert.equal(row.workspaceId, workspaceId);

    // fileUrl-only create must fail (no content)
    const urlOnly = await request(server, 'POST', '/api/documents', {
      token,
      body: {
        title: 'URL only',
        category: 'Shared',
        fileUrl: evilUrl
      }
    });
    assert.equal(urlOnly.status, 400);
    assert.equal(urlOnly.json.error, 'file_required');

    await prisma.document.deleteMany({ where: { workspaceId } });
    await prisma.session.deleteMany({
      where: { user: { workspaceId } }
    });
    await prisma.userConsent.deleteMany({
      where: { user: { workspaceId } }
    });
    await prisma.emailInvite.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  });
});
