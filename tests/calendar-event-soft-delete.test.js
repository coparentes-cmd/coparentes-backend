/**
 * Soft-delete calendar events: creator-only, remains in GET /calendar with deletedAt.
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

const PASSWORD = 'CalendarSoftDelete99!';

const consents = {
  TERMS: true,
  DATA_PROCESSING: true,
  CHILD_DATA: true,
  EMAIL_NOTIFICATIONS: false,
  MARKETING: false,
  ANALYTICS: false
};

describe('Calendar event soft-delete', { skip: !(await dbReady()) }, () => {
  /** @type {import('node:http').Server} */
  let server;
  /** @type {string[]} */
  const testEmails = [];
  /** @type {string | null} */
  let testWorkspaceId = null;

  before(async () => {
    server = await listen(createApp());
  });

  after(async () => {
    server?.close();
    if (testWorkspaceId) {
      await prisma.calendarEvent.deleteMany({
        where: { workspaceId: testWorkspaceId }
      });
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

  it('parentB cannot delete; parentA soft-deletes; GET still returns deletedAt', async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const emailA = `cal-del-a-${id}@test.coparentes.app`;
    const emailB = `cal-del-b-${id}@test.coparentes.app`;
    testEmails.push(emailA, emailB);

    const register = await request(server, 'POST', '/api/auth/register', {
      body: {
        name: 'Cal Delete Anna',
        email: emailA,
        password: PASSWORD,
        workspaceName: 'Rodzina Cal Soft Delete',
        consents
      }
    });
    assert.equal(register.status, 201, JSON.stringify(register.json));
    testWorkspaceId = register.json.workspace.id;
    const tokenA = register.json.token;
    const inviteCode = register.json.workspace.inviteCode;

    const join = await request(server, 'POST', '/api/auth/join', {
      body: {
        name: 'Cal Delete Marek',
        email: emailB,
        password: PASSWORD,
        inviteCode,
        role: 'parentB'
      }
    });
    assert.equal(join.status, 201, JSON.stringify(join.json));
    const tokenB = join.json.token;

    const startDate = new Date('2026-09-26T07:00:00.000Z').toISOString();
    const created = await request(server, 'POST', '/api/calendar/events', {
      token: tokenA,
      body: {
        title: 'Mecz soft-delete',
        startDate,
        type: 'activity'
      }
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.deletedAt, null);
    const eventId = created.json.id;
    assert.ok(eventId);

    const forbidden = await request(
      server,
      'DELETE',
      `/api/calendar/events/${eventId}`,
      { token: tokenB }
    );
    assert.equal(forbidden.status, 403, JSON.stringify(forbidden.json));
    assert.equal(forbidden.json.error, 'forbidden');

    const stillActive = await prisma.calendarEvent.findUnique({
      where: { id: eventId }
    });
    assert.equal(stillActive.deletedAt, null);

    const deleted = await request(
      server,
      'DELETE',
      `/api/calendar/events/${eventId}`,
      { token: tokenA }
    );
    assert.equal(deleted.status, 200, JSON.stringify(deleted.json));
    assert.equal(deleted.json.id, eventId);
    assert.ok(deleted.json.deletedAt);

    const snap = await request(server, 'GET', '/api/calendar', {
      token: tokenA
    });
    assert.equal(snap.status, 200, JSON.stringify(snap.json));
    const fromApi = (snap.json.events || []).find((e) => e.id === eventId);
    assert.ok(fromApi, 'soft-deleted event must still appear in GET /calendar');
    assert.ok(fromApi.deletedAt);

    const row = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
    assert.ok(row);
    assert.ok(row.deletedAt);
  });
});
