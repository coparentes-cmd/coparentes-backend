import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireParentRole } from '../middleware/rbac.js';
import {
  createExpense,
  listExpenses,
  updateExpenseStatus
} from '../services/finances.js';

const router = express.Router();

router.use(requireAuth);

router.get('/expenses', async (req, res, next) => {
  try {
    const expenses = await listExpenses(req.user.workspaceId);
    return res.json({ expenses });
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
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    return next(error);
  }
});

router.post('/expenses/:expenseId/status', requireParentRole, async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['pending', 'accepted', 'disputed', 'settled'])
    });
    const data = schema.parse(req.body);

    const expense = await updateExpenseStatus({
      workspaceId: req.user.workspaceId,
      expenseId: req.params.expenseId,
      status: data.status
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
