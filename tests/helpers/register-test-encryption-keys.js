import { ensureTestEncryptionKeys } from './encryptionKeys.js';

// Must run before any test file imports src/* (dotenv). Otherwise Railway
// DATABASE_URL from .env wins and dbReady() suites skip.
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/coparentes';
process.env.FRONTEND_URL ??= 'http://localhost:8080';

ensureTestEncryptionKeys();
