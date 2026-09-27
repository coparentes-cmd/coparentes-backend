-- Multi-child expense tagging via join table.
-- Legacy Expense.childId is kept until a later drop migration.

CREATE TABLE "ExpenseChild" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseChild_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseChild_expenseId_childId_key" ON "ExpenseChild"("expenseId", "childId");

CREATE INDEX "ExpenseChild_expenseId_idx" ON "ExpenseChild"("expenseId");

CREATE INDEX "ExpenseChild_childId_idx" ON "ExpenseChild"("childId");

ALTER TABLE "ExpenseChild" ADD CONSTRAINT "ExpenseChild_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpenseChild" ADD CONSTRAINT "ExpenseChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy Expense.childId (prod had 9 rows with non-null childId as of 2026-09-27).
INSERT INTO "ExpenseChild" ("id", "expenseId", "childId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || "id")::text,
  "id",
  "childId",
  CURRENT_TIMESTAMP
FROM "Expense"
WHERE "childId" IS NOT NULL
ON CONFLICT ("expenseId", "childId") DO NOTHING;
