import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { CRYPTO_KEYS, decryptOptional, encryptOptional } from './crypto.service.js';
import { serializeExpense } from './calendar.js';
import { validateReceiptBase64 } from './receiptOcr.js';

export async function listExpensesInRange(workspaceId, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const rows = await prisma.expense.findMany({
    where: {
      workspaceId,
      date: { gte: from, lte: to }
    },
    orderBy: { date: 'desc' }
  });

  return rows.map(serializeExpense);
}

export async function listExpenses(workspaceId) {
  const rows = await prisma.expense.findMany({
    where: { workspaceId },
    orderBy: { date: 'desc' }
  });

  return rows.map(serializeExpense);
}

export async function createExpense({
  workspaceId,
  title,
  amount,
  currency,
  category,
  childId,
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

  if (childId) {
    const child = await prisma.child.findFirst({
      where: { id: childId, workspaceId }
    });
    if (!child) {
      const error = new Error('child_not_found');
      error.code = 'child_not_found';
      throw error;
    }
  }

  if (receiptContentBase64) {
    validateReceiptBase64(receiptContentBase64);
  }

  const payload = {
    workspaceId,
    title,
    amount,
    currency: currency ?? 'PLN',
    category,
    childId: childId ?? null,
    paidById: paidBy,
    splitRatio,
    date,
    receiptUrl: receiptUrl ?? null,
    status: status ?? 'pending',
    note: note ?? null,
    createdAt: new Date().toISOString()
  };

  const row = await prisma.expense.create({
    data: {
      workspaceId,
      title: encryptOptional(title, CRYPTO_KEYS.KEY_FINANCE),
      amount,
      currency: currency ?? 'PLN',
      category,
      childId: childId ?? null,
      paidById: paidBy,
      splitRatio,
      date: new Date(date),
      receiptUrl: receiptContentBase64 ? null : receiptUrl ?? null,
      receiptContentBase64: receiptContentBase64
        ? encryptOptional(receiptContentBase64, CRYPTO_KEYS.KEY_FINANCE)
        : null,
      receiptMimeType: receiptContentBase64 ? (receiptMimeType ?? 'image/jpeg') : null,
      status: status ?? 'pending',
      note: encryptOptional(note ?? null, CRYPTO_KEYS.KEY_FINANCE),
      hash: createIntegrityHash(payload)
    }
  });

  if (receiptContentBase64) {
    const updated = await prisma.expense.update({
      where: { id: row.id },
      data: {
        receiptUrl: `finances/expenses/${row.id}/receipt`
      }
    });
    return serializeExpense(updated);
  }

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
    data
  });

  return serializeExpense(updated);
}
