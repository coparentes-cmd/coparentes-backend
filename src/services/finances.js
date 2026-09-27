import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { CRYPTO_KEYS, decryptOptional, encryptOptional } from './crypto.service.js';
import { serializeExpense } from './calendar.js';
import { validateReceiptBase64 } from './receiptOcr.js';

const expenseChildrenInclude = { children: true };

export async function listExpensesInRange(workspaceId, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const rows = await prisma.expense.findMany({
    where: {
      workspaceId,
      date: { gte: from, lte: to }
    },
    include: expenseChildrenInclude,
    orderBy: { date: 'desc' }
  });

  return rows.map(serializeExpense);
}

export async function listExpenses(workspaceId) {
  const rows = await prisma.expense.findMany({
    where: { workspaceId },
    include: expenseChildrenInclude,
    orderBy: { date: 'desc' }
  });

  return rows.map(serializeExpense);
}

async function assertChildrenInWorkspace(workspaceId, childIds) {
  const uniqueIds = [...new Set(childIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const found = await prisma.child.findMany({
    where: { workspaceId, id: { in: uniqueIds } },
    select: { id: true }
  });

  if (found.length !== uniqueIds.length) {
    const error = new Error('child_not_found');
    error.code = 'child_not_found';
    throw error;
  }

  return uniqueIds;
}

export async function createExpense({
  workspaceId,
  title,
  amount,
  currency,
  category,
  childIds = [],
  paidBy,
  splitRatio,
  date,
  receiptUrl,
  receiptContentBase64,
  receiptMimeType,
  status,
  note
}) {
  const payer = await prisma.user.findFirst({
    where: { id: paidBy, workspaceId }
  });
  if (!payer) {
    const error = new Error('invalid_paid_by');
    error.code = 'invalid_paid_by';
    throw error;
  }

  const resolvedChildIds = await assertChildrenInWorkspace(
    workspaceId,
    Array.isArray(childIds) ? childIds : []
  );

  if (receiptContentBase64) {
    validateReceiptBase64(receiptContentBase64);
  }

  const payload = {
    workspaceId,
    title,
    amount,
    currency: currency ?? 'PLN',
    category,
    childIds: resolvedChildIds,
    paidById: paidBy,
    splitRatio,
    date,
    receiptUrl: receiptUrl ?? null,
    status: status ?? 'pending',
    note: note ?? null,
    createdAt: new Date().toISOString()
  };

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        workspaceId,
        title: encryptOptional(title, CRYPTO_KEYS.KEY_FINANCE),
        amount,
        currency: currency ?? 'PLN',
        category,
        // Legacy column kept until drop migration; new API uses ExpenseChild only.
        childId: null,
        paidById: paidBy,
        splitRatio,
        date: new Date(date),
        receiptUrl: receiptContentBase64 ? null : receiptUrl ?? null,
        receiptContentBase64: receiptContentBase64
          ? encryptOptional(receiptContentBase64, CRYPTO_KEYS.KEY_FINANCE)
          : null,
        receiptMimeType: receiptContentBase64
          ? (receiptMimeType ?? 'image/jpeg')
          : null,
        status: status ?? 'pending',
        note: encryptOptional(note ?? null, CRYPTO_KEYS.KEY_FINANCE),
        hash: createIntegrityHash(payload)
      }
    });

    if (resolvedChildIds.length > 0) {
      await tx.expenseChild.createMany({
        data: resolvedChildIds.map((childId) => ({
          expenseId: created.id,
          childId
        }))
      });
    }

    if (receiptContentBase64) {
      await tx.expense.update({
        where: { id: created.id },
        data: {
          receiptUrl: `finances/expenses/${created.id}/receipt`
        }
      });
    }

    return tx.expense.findUniqueOrThrow({
      where: { id: created.id },
      include: expenseChildrenInclude
    });
  });

  return serializeExpense(row);
}

export async function getExpenseReceipt(workspaceId, expenseId) {
  const row = await prisma.expense.findFirst({
    where: { id: expenseId, workspaceId },
    select: {
      id: true,
      receiptContentBase64: true,
      receiptMimeType: true
    }
  });

  if (!row?.receiptContentBase64) {
    return null;
  }

  return {
    expenseId: row.id,
    contentBase64: decryptOptional(row.receiptContentBase64, CRYPTO_KEYS.KEY_FINANCE),
    mimeType: row.receiptMimeType ?? 'image/jpeg'
  };
}

export async function updateExpenseStatus({
  workspaceId,
  expenseId,
  status,
  note
}) {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, workspaceId }
  });

  if (!existing) {
    return null;
  }

  const data = { status };
  if (note !== undefined) {
    data.note = note;
  }

  const updated = await prisma.expense.update({
    where: { id: existing.id },
    data,
    include: expenseChildrenInclude
  });

  return serializeExpense(updated);
}
