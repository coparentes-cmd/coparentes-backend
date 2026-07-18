import { z } from 'zod';

/**
 * Entity IDs in this project are Prisma cuid() strings (and client-generated
 * attachment ids). Reject non-strings / operator-shaped objects before they
 * reach Prisma `where` clauses (defense against query-operator injection).
 */
export const entityIdSchema = z
  .string({ error: 'id_must_be_string' })
  .trim()
  .min(1, 'id_required')
  .max(80, 'id_too_long')
  .regex(/^[A-Za-z0-9_-]+$/, 'id_invalid_chars');

export const optionalEntityIdSchema = entityIdSchema.nullable().optional();

/**
 * @param {unknown} value
 * @param {string} [field]
 * @returns {string}
 */
export function parseEntityId(value, field = 'id') {
  const parsed = entityIdSchema.safeParse(value);
  if (!parsed.success) {
    const error = new Error(`invalid_${field}`);
    error.code = 'invalid_id';
    error.name = 'ZodError';
    error.issues = parsed.error.issues;
    error.flatten = () => parsed.error.flatten();
    throw error;
  }
  return parsed.data;
}

/**
 * Service-layer guard: coerce only plain strings; never pass objects into Prisma.
 * @param {unknown} value
 * @param {string} [field]
 * @returns {string}
 */
export function requireEntityId(value, field = 'id') {
  if (typeof value !== 'string') {
    const error = new Error(`invalid_${field}`);
    error.code = 'invalid_id';
    throw error;
  }
  return parseEntityId(value, field);
}
