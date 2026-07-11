import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireNonChildRole, requireParentRole } from '../middleware/rbac.js';
import {
  createExpense,
  getExpenseReceipt,
  listExpenses,
  updateExpenseStatus
} from '../services/finances.js';
import { parseReceiptImage } from '../services/receiptOcr.js';

const router = express.Router();

router.use(requireAuth);

router.get('/expenses', requireNonChildRole, async (req, res, next) => {
  try {
    const expenses = await listExpenses(req.user.workspaceId);
    return res.json({ expenses });
  } catch (error) {
    return next(error);
  }
});

router.post('/receipts/parse', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      contentBase64: z.string().min(1),
      mimeType: z.string().min(1).max(100).optional()
    });
    const data = schema.parse(req.body);
    const parsed = await parseReceiptImage({
      contentBase64: data.contentBase64,
      mimeType: data.mimeType
    });
    return res.json(parsed);
  } catch (error) {
    if (error?.code === 'receipt_too_large') {
      return res.status(400).json({ error: 'receipt_too_large' });
    }
    if (
      error?.code === 'receipt_invalid_base64' ||
      error?.code === 'receipt_empty' ||
      error?.code === 'receipt_unsupported_format'
    ) {
      return res.status(400).json({ error: 'receipt_invalid' });
    }
    if (error?.code === 'receipt_unreadable') {
      return res.status(422).json({ error: 'receipt_unreadable' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.get('/expenses/:expenseId/receipt', requireNonChildRole, async (req, res, next) => {
  try {
    const receipt = await getExpenseReceipt(
      req.user.workspaceId,
      req.params.expenseId
    );
    if (!receipt) {
      return res.status(404).json({ error: 'receipt_not_found' });
    }
    return res.json(receipt);
  } catch (error) {
    return next(error);
  }
});

router.post('/expenses', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      amount: z.number().positive(),
      currency: z.string().min(3).max(3).optional(),
      category: z.string().min(1),
      childId: z.string().nullable().optional(),
      paidBy: z.string().min(1),
      splitRatio: z.number().min(0).max(1),
      date: z.string().datetime(),
      receiptUrl: z.string().nullable().optional(),
      receiptContentBase64: z.string().nullable().optional(),
      receiptMimeType: z.string().max(100).nullable().optional(),
      status: z.enum(['pending', 'accepted', 'disputed', 'settled']).optional(),
      note: z.string().max(2000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const expense = await createExpense({
      workspaceId: req.user.workspaceId,
      ...data
    });

    return res.status(201).json(expense);
  } catch (error) {
    if (error?.code === 'child_not_found') {
      return res.status(400).json({ error: 'child_not_found' });
    }
    if (error?.code === 'invalid_paid_by') {
      return res.status(400).json({ error: 'invalid_paid_by' });
    }
    if (error?.code === 'receipt_too_large') {
      return res.status(400).json({ error: 'receipt_too_large' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/expenses/:expenseId/status', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['pending', 'accepted', 'disputed', 'settled']),
      note: z.string().max(2000).nullable().optional()
    });
    const data = schema.parse(req.body);

    const expense = await updateExpenseStatus({
      workspaceId: req.user.workspaceId,
      expenseId: req.params.expenseId,
      status: data.status,
      note: data.note
    });

    if (!expense) {
      return res.status(404).json({ error: 'expense_not_found' });
    }

    return res.json(expense);
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

export default router;
