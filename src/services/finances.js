import { prisma } from '../lib/prisma.js';
import { createIntegrityHash } from '../utils/security.js';
import { serializeExpense } from './calendar.js';

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
      title,
      amount,
      currency: currency ?? 'PLN',
      category,
      childId: childId ?? null,
      paidById: paidBy,
      splitRatio,
      date: new Date(date),
      receiptUrl: receiptUrl ?? null,
      status: status ?? 'pending',
      note: note ?? null,
      hash: createIntegrityHash(payload)
    }
  });

  return serializeExpense(row);
}

export async function updateExpenseStatus({
  workspaceId,
  expenseId,
  status
}) {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, workspaceId }
  });

  if (!existing) {
    return null;
  }

  const updated = await prisma.expense.update({
    where: { id: existing.id },
    data: { status }
  });

  return serializeExpense(updated);
}
