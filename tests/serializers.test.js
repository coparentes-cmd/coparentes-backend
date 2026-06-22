import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { serializeThread } from '../src/services/serializers.js';

describe('serializeThread hasUnread', () => {
  const thread = {
    id: 'thread_1',
    subject: 'Test',
    category: 'Szkoła',
    childId: null,
    lastActivity: new Date('2026-01-01T12:00:00.000Z')
  };

  const messages = [
    {
      id: 'msg_a',
      threadId: 'thread_1',
      senderId: 'user_a',
      senderName: 'Anna',
      content: 'Od Anny',
      tone: 'neutral',
      sentAt: new Date('2026-01-01T12:00:00.000Z'),
      isDelivered: true,
      isRead: false,
      hash: 'hash_a'
    },
    {
      id: 'msg_b',
      threadId: 'thread_1',
      senderId: 'user_b',
      senderName: 'Marek',
      content: 'Od Marka',
      tone: 'neutral',
      sentAt: new Date('2026-01-01T12:01:00.000Z'),
      isDelivered: true,
      isRead: false,
      hash: 'hash_b'
    }
  ];

  it('marks unread only for incoming messages per viewer', () => {
    const forA = serializeThread(thread, messages, 'user_a');
    const forB = serializeThread(thread, messages, 'user_b');

    assert.equal(forA.hasUnread, true, 'parentA should see Marek message as unread');
    assert.equal(forB.hasUnread, true, 'parentB should see Anna message as unread');
  });

  it('does not count own unread messages for viewer', () => {
    const onlyOwnUnread = [
      {
        ...messages[0],
        isRead: false
      }
    ];

    const forA = serializeThread(thread, onlyOwnUnread, 'user_a');
    assert.equal(forA.hasUnread, false);
  });
});
