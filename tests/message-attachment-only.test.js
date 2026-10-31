import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { entityIdSchema } from '../src/utils/ids.js';

/** Mirrors POST /threads/:id/messages body schema (attachment-only allowed). */
const messageBodySchema = z
  .object({
    content: z.string().max(8000).optional().default(''),
    tone: z.enum(['neutral', 'tense', 'aggressive', 'positive']).optional(),
    attachments: z
      .array(
        z.object({
          id: entityIdSchema,
          name: z.string().trim().min(1).max(255),
          type: z.string().trim().min(1).max(120),
          sizeBytes: z.number().int().positive().max(262144),
          contentBase64: z.string().min(1).max(400_000)
        })
      )
      .max(3)
      .optional()
  })
  .superRefine((value, ctx) => {
    const hasText = String(value.content ?? '').trim().length > 0;
    const hasAttachments = (value.attachments?.length ?? 0) > 0;
    if (!hasText && !hasAttachments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'message_empty',
        path: ['content']
      });
    }
  });

test('message body accepts attachment-only payload', () => {
  const parsed = messageBodySchema.parse({
    content: '',
    attachments: [
      {
        id: 'att_550e8400-e29b-41d4-a716-446655440000',
        name: 'instrukcja-nowa-rodzina.md',
        type: 'text/markdown',
        sizeBytes: 5500,
        contentBase64: 'aGVsbG8='
      }
    ]
  });
  assert.equal(parsed.content, '');
  assert.equal(parsed.attachments.length, 1);
});

test('message body rejects empty content without attachments', () => {
  const result = messageBodySchema.safeParse({ content: '   ' });
  assert.equal(result.success, false);
});
