# Coparentes Backend

Node.js API (Express + Prisma + PostgreSQL) for the Coparentes co-parenting Flutter app.

## Prisma models

| Model | Opis |
|-------|------|
| `Workspace` | Rodzina; **`inviteCode`** — kod do `/api/auth/join` |
| `User` | Członek workspace (`parentA`, `parentB`, `child`, `observer`) |
| `Child` | Dziecko w workspace |
| `Session` | Token Bearer (sesja API) |
| `Thread` / `Message` | Czat współrodzicielski |
| `ExportJob` | Eksport dowodów |
| `EmailInvite` | Zaproszenie mailem (osobny flow) |

## Stack

- Node.js 20+, ES modules
- Express 4
- Prisma 6 + PostgreSQL
- Session tokens (Bearer) — compatible with the Flutter client

## API (prefix `/api`) — zgodność z Flutter

| Flutter | Method | Path | Response |
|---------|--------|------|----------|
| `AppApiClient.pingHealth` | GET | `/health` | `{ status: "ok" }` |
| `AuthRepository.registerWorkspace` | POST | `/auth/register` | `{ token, user, workspace }` |
| `AuthRepository.joinWorkspace` | POST | `/auth/join` | `{ token, user, workspace }` |
| `AuthRepository.login` | POST | `/auth/login` | `{ token, user, workspace }` |
| `AuthRepository.restoreSession` | GET | `/auth/session` | `{ token, user, workspace }` |
| `AuthRepository.logout` | POST | `/auth/logout` | `204` (empty body) |
| `MessagingRepository.getThreads` | GET | `/threads` | `{ threads: [...] }` |
| `MessagingRepository.createThread` | POST | `/threads` | `MessageThread` object |
| `MessagingRepository.sendMessage` | POST | `/threads/:id/messages` | `MessageThread` object |
| `ExportRepository.getExports` | GET | `/exports` | `{ jobs: [...] }` |
| `ExportRepository.createExport` | POST | `/exports` | `ExportJob` object |
| `ExportRepository.downloadExport` | GET | `/exports/:id/download` | `{ ...job, payload }` |
| `CalendarRepository.fetchCalendar` | GET | `/calendar` | `{ custodySlots, events, swapRequests }` |
| `CalendarRepository.respondToSwap` | POST | `/calendar/swaps/:id/respond` | `SwapRequest` object |
| `FinanceRepository.getExpenses` | GET | `/finances/expenses` | `{ expenses: [...] }` |
| `FinanceRepository.createExpense` | POST | `/finances/expenses` | `Expense` object |
| `FinanceRepository.updateExpenseStatus` | POST | `/finances/expenses/:id/status` | `Expense` object |

Auth: header `Authorization: Bearer <session token>` (tabela `Session`, nie JWT).

### Security notes (post-remediation)

- Seeding requires `ALLOW_SEED=true` and explicit `SEED_TEST_PASSWORD` (never enabled by default in production).
- Parent-only write access: child/observer roles are read-only on mutation routes (`requireParentRole` middleware).
- Export jobs expire after `EXPORT_TTL_DAYS` (default 30); set `INTEGRITY_SECRET` for HMAC manifest hashes.
- **2FA (FIX-043 roadmap):** UI toggle is disabled until TOTP verification is implemented; do not enable `twoFactorEnabled` in production flows yet.
- CORS allows requests with no `Origin` header (mobile/curl); browser origins are still validated.

## Setup

```bash
cp .env.example .env
npm install
npm run db:up          # Docker Compose, or embedded PostgreSQL fallback
npm run db:migrate
SEED_DEMO_DATA=true npm run dev
npm test
bash scripts/verify-flutter-api.sh
# E2E: register → join → thread → message → export → download
RUN_E2E=true npm run test:e2e
```

### Test E2E (wymaga PostgreSQL)

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/coparentes
npm run db:migrate
npm run test:e2e
```

Test tworzy unikalnych użytkowników `*@test.coparentes.app` i czyści ich po zakończeniu.

Demo accounts (when `SEED_DEMO_DATA=true`):

- `anna@coparentes.app` / `Coparentes!123` (parentA)
- `marek@coparentes.app` / `Coparentes!123` (parentB)
- Workspace invite code: `KOWALSCY2026`

### Test account (Railway / empty DB)

`npm start` runs `scripts/seed-test-user.js` after migrations. On every deploy it **ensures** this account exists and resets its password:

- `test@coparentes.app` / `Test1234!` (parentA)

Logs to look for on Railway:

```text
[seed-test-user] ensuring test account test@coparentes.app ...
Seeded test user: test@coparentes.app ...
```

or `Ensured test user password: test@coparentes.app` if the account already existed.

Set `SEED_TEST_USER=false` on Railway to disable. Manual run: `npm run db:seed:test`.

## Deploy

Docker / Railway / Render with PostgreSQL `DATABASE_URL`. Set `PUBLIC_BASE_URL` to your API origin (for export download URLs).

**Railway CORS (required for Flutter web):**

```bash
FRONTEND_URL=https://your-app.netlify.app
CORS_ORIGINS=https://your-app.netlify.app,https://coparentes.ai
PUBLIC_BASE_URL=https://coparentes-backend-production.up.railway.app
```

**Workspace onboarding:** `POST /api/workspace/children` (parentA only) with `{ name, dateOfBirth, school? }`.

**Exports:** `calendar`, `finances`, and `fullPack` types include dated items in the export payload (`recordType` on each row; message exports remain thread objects).

The API also allows `*.netlify.app` and `*.coparentes.ai` origins by default. Local dev allows any `localhost` / `127.0.0.1` port.

**CORS and missing `Origin`:** Requests without an `Origin` header (same-origin navigation, curl, some mobile clients) are allowed through middleware. Cross-origin browser calls with credentials always send `Origin`; unknown origins receive `403`.

Flutter web build:

```bash
flutter build web --dart-define=COPARENTES_API_BASE_URL=https://your-api.example.com/api
```
