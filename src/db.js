const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");

const {
  hashPassword,
  createInviteCode,
  createIntegrityHash,
} = require("./security");

const { config } = require("./config");

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createDatabase(options = {}) {
  const settings =
    typeof options === "string"
      ? { filename: options }
      : options;

  const resolvedPath = settings.filename ?? config.dbPath;
  ensureDirectory(resolvedPath);

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  initializeSchema(db);
  if (settings.seedDemoData ?? config.seedDemoData) {
    seedDatabase(db);
  }
  return db;
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      high_conflict_mode INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      school TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      child_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_activity TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (child_id) REFERENCES children(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      tone TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      is_delivered INTEGER NOT NULL DEFAULT 1,
      is_read INTEGER NOT NULL DEFAULT 0,
      hash TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (sender_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      type TEXT NOT NULL,
      thread_id TEXT,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      status TEXT NOT NULL,
      download_url TEXT,
      manifest_hash TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    );
  `);
}

function seedDatabase(db) {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount > 0) {
    return;
  }

  const now = new Date().toISOString();
  const workspaceId = "ws_kowalscy";
  const childId = "child_zosia";
  const threadId = "thread_school_1";
  const threadTwoId = "thread_health_1";

  db.prepare(
    `INSERT INTO workspaces (id, name, invite_code, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(workspaceId, "Rodzina Kowalska", "KOWALSCY2026", now);

  const insertUser = db.prepare(
    `INSERT INTO users (
      id, workspace_id, name, email, password_hash, role,
      two_factor_enabled, high_conflict_mode, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertUser.run(
    "user_parent_a",
    workspaceId,
    "Anna Kowalska",
    "anna@coparentes.app",
    hashPassword("Coparentes!123"),
    "parentA",
    1,
    0,
    now,
  );
  insertUser.run(
    "user_parent_b",
    workspaceId,
    "Marek Kowalski",
    "marek@coparentes.app",
    hashPassword("Coparentes!123"),
    "parentB",
    1,
    0,
    now,
  );
  insertUser.run(
    "user_observer",
    workspaceId,
    "Adw. Maria Nowak",
    "maria@coparentes.app",
    hashPassword("Coparentes!123"),
    "observer",
    1,
    0,
    now,
  );

  db.prepare(
    `INSERT INTO children (id, workspace_id, name, date_of_birth, school)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(childId, workspaceId, "Zosia Kowalska", "2016-05-12", "SP nr 15 w Warszawie");

  const insertThread = db.prepare(
    `INSERT INTO threads (
      id, workspace_id, subject, category, child_id,
      created_by, created_at, last_activity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertThread.run(
    threadId,
    workspaceId,
    "Angielski czwartek 17:00",
    "Szkoła",
    childId,
    "user_parent_a",
    now,
    now,
  );
  insertThread.run(
    threadTwoId,
    workspaceId,
    "Wizyta u dentysty",
    "Zdrowie",
    childId,
    "user_parent_a",
    now,
    now,
  );

  const insertMessage = db.prepare(
    `INSERT INTO messages (
      id, thread_id, workspace_id, sender_id, sender_name,
      content, tone, sent_at, is_delivered, is_read, hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const firstMessagePayload = {
    threadId,
    senderId: "user_parent_a",
    content:
      "Zosia ma zajęcia z angielskiego w czwartek o 17:00 przy ul. Mokotowskiej 12. Proszę o potwierdzenie odbioru.",
    sentAt: now,
  };
  insertMessage.run(
    "msg_school_1",
    threadId,
    workspaceId,
    "user_parent_a",
    "Anna",
    firstMessagePayload.content,
    "neutral",
    now,
    1,
    1,
    createIntegrityHash(firstMessagePayload),
  );

  const secondMessagePayload = {
    threadId,
    senderId: "user_parent_b",
    content: "Potwierdzam. Odbiorę Zosię punktualnie.",
    sentAt: now,
  };
  insertMessage.run(
    "msg_school_2",
    threadId,
    workspaceId,
    "user_parent_b",
    "Marek",
    secondMessagePayload.content,
    "neutral",
    now,
    1,
    0,
    createIntegrityHash(secondMessagePayload),
  );

  const healthMessagePayload = {
    threadId: threadTwoId,
    senderId: "user_parent_a",
    content:
      "Zosia była u dentysty. Koszt 280 PLN. Proszę o zwrot 140 PLN zgodnie z ustalonym podziałem.",
    sentAt: now,
  };
  insertMessage.run(
    "msg_health_1",
    threadTwoId,
    workspaceId,
    "user_parent_a",
    "Anna",
    healthMessagePayload.content,
    "neutral",
    now,
    1,
    1,
    createIntegrityHash(healthMessagePayload),
  );

  const exportPayload = {
    type: "messages",
    workspaceId,
    generatedAt: now,
    items: [threadId, threadTwoId],
  };
  db.prepare(
    `INSERT INTO export_jobs (
      id, workspace_id, requested_by, type, thread_id, from_date,
      to_date, status, download_url, manifest_hash, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "export_seed_messages",
    workspaceId,
    "user_parent_a",
    "messages",
    null,
    "2025-01-01T00:00:00.000Z",
    now,
    "completed",
    "/api/exports/export_seed_messages/download",
    createIntegrityHash(exportPayload),
    JSON.stringify(exportPayload),
    now,
  );
}

function createWorkspace(db, { name }) {
  const id = `ws_${Date.now()}`;
  const inviteCode = createInviteCode();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO workspaces (id, name, invite_code, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, name, inviteCode, createdAt);

  return db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
}

function getWorkspaceGraph(db, workspaceId) {
  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId);
  if (!workspace) {
    return null;
  }

  const members = db
    .prepare(
      `SELECT id, name, email, role, two_factor_enabled, high_conflict_mode, created_at
       FROM users WHERE workspace_id = ? ORDER BY created_at ASC`,
    )
    .all(workspaceId);
  const children = db
    .prepare(
      `SELECT id, name, date_of_birth, school
       FROM children WHERE workspace_id = ? ORDER BY name ASC`,
    )
    .all(workspaceId);

  return {
    id: workspace.id,
    name: workspace.name,
    inviteCode: workspace.invite_code,
    createdAt: workspace.created_at,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      twoFactorEnabled: Boolean(member.two_factor_enabled),
      highConflictMode: Boolean(member.high_conflict_mode),
      createdAt: member.created_at,
    })),
    children: children.map((child) => ({
      id: child.id,
      name: child.name,
      dateOfBirth: child.date_of_birth,
      school: child.school,
    })),
  };
}

module.exports = {
  createDatabase,
  createWorkspace,
  getWorkspaceGraph,
};
