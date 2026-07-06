import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listMessageTagsForUser,
  setMessageTagsForUser
} from '../src/services/messageTags.js';

test('messageTags service normalizes and scopes tags per user', async (t) => {
  const workspaceId = 'ws_tags_test';
  const userA = 'user_tags_a';
  const userB = 'user_tags_b';
  const messageId = 'msg_tags_1';
  const threadId = 'thread_tags_1';

  await t.test('setup prisma records', async () => {
    const { prisma } = await import('../src/lib/prisma.js');
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: {
        id: workspaceId,
        name: 'Tags Test',
        inviteCode: 'TAGS1234',
        childInviteCode: 'TAGSCHLD'
      }
    });
    for (const user of [
      { id: userA, email: 'tags-a@test.local', name: 'A' },
      { id: userB, email: 'tags-b@test.local', name: 'B' }
    ]) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {},
        create: {
          id: user.id,
          workspaceId,
          name: user.name,
          email: user.email,
          passwordHash: 'hash',
          role: 'parentA'
        }
      });
    }
    await prisma.thread.upsert({
      where: { id: threadId },
      update: {},
      create: {
        id: threadId,
        workspaceId,
        subject: 'Szkoła',
        category: 'Szkoła',
        createdById: userA
      }
    });
    await prisma.message.upsert({
      where: { id: messageId },
      update: {},
      create: {
        id: messageId,
        threadId,
        workspaceId,
        senderId: userA,
        senderName: 'A',
        content: 'Test',
        hash: 'hash'
      }
    });
  });

  await setMessageTagsForUser({
    workspaceId,
    userId: userA,
    messageId,
    tags: [' Paragon ', 'PILNE']
  });

  const tagsA = await listMessageTagsForUser({ workspaceId, userId: userA });
  assert.deepEqual(
    tagsA.map((item) => item.tag).sort(),
    ['paragon', 'pilne']
  );

  const tagsB = await listMessageTagsForUser({ workspaceId, userId: userB });
  assert.equal(tagsB.length, 0);

  await t.test('cleanup', async () => {
    const { prisma } = await import('../src/lib/prisma.js');
    await prisma.messageUserTag.deleteMany({ where: { workspaceId } });
    await prisma.message.deleteMany({ where: { workspaceId } });
    await prisma.thread.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
  });
});
