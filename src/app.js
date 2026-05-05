const crypto = require("node:crypto");

const cors = require("cors");
const express = require("express");
const { z } = require("zod");

const { createDatabase, createWorkspace, getWorkspaceGraph } = require("./db");
const {
  hashPassword,
  verifyPassword,
  createToken,
  createIntegrityHash,
} = require("./security");
const { config, isOriginAllowed } = require("./config");

const SESSION_TTL_DAYS = config.sessionTtlDays;

function createApp(options = {}) {
  const app = express();
  const db =
    options.db ??
    createDatabase({
      filename: options.databasePath,
      seedDemoData: options.seedDemoData,
    });

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : 0);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    );
    if (config.isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
    }
    next();
  });

  if (config.logRequests) {
    app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on("finish", () => {
        console.log(
          `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`,
        );
      });
      next();
    });
  }

  app.use(
    cors({
      origin(origin, callback) {
        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: config.jsonLimit }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "coparentes-backend",
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/ready", (_req, res) => {
    try {
      db.prepare("SELECT 1 AS ok").get();
      res.json({
        status: "ready",
        database: "ok",
        environment: config.nodeEnv,
      });
    } catch (error) {
      console.error(error);
      res.status(503).json({ status: "not_ready", database: "error" });
    }
  });

  app.post("/api/auth/register", (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.email(),
      password: z.string().min(10),
      workspaceName: z.string().min(2),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(parsed.data.email);
    if (existingUser) {
      return res.status(409).json({ error: "email_in_use" });
    }

    const workspace = createWorkspace(db, { name: parsed.data.workspaceName });
    const createdAt = new Date().toISOString();
    const userId = `user_${Date.now()}`;

    db.prepare(
      `INSERT INTO users (
        id, workspace_id, name, email, password_hash, role,
        two_factor_enabled, high_conflict_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      workspace.id,
      parsed.data.name,
      parsed.data.email,
      hashPassword(parsed.data.password),
      "parentA",
      1,
      0,
      createdAt,
    );

    const user = db
      .prepare(
        `SELECT id, workspace_id, name, email, role, two_factor_enabled, high_conflict_mode, created_at
         FROM users WHERE id = ?`,
      )
      .get(userId);

    return res.status(201).json(createSessionPayload(db, user));
  });

  app.post("/api/auth/join", (req, res) => {
    const schema = z.object({
      inviteCode: z.string().min(6),
      name: z.string().min(2),
      email: z.email(),
      password: z.string().min(10),
      role: z.enum(["parentB", "child", "observer"]),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(parsed.data.email);
    if (existingUser) {
      return res.status(409).json({ error: "email_in_use" });
    }

    const workspace = db
      .prepare("SELECT * FROM workspaces WHERE invite_code = ?")
      .get(parsed.data.inviteCode.trim().toUpperCase());
    if (!workspace) {
      return res.status(404).json({ error: "workspace_not_found" });
    }

    const createdAt = new Date().toISOString();
    const userId = `user_${Date.now()}`;
    db.prepare(
      `INSERT INTO users (
        id, workspace_id, name, email, password_hash, role,
        two_factor_enabled, high_conflict_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      workspace.id,
      parsed.data.name,
      parsed.data.email,
      hashPassword(parsed.data.password),
      parsed.data.role,
      1,
      0,
      createdAt,
    );

    const user = db
      .prepare(
        `SELECT id, workspace_id, name, email, role, two_factor_enabled, high_conflict_mode, created_at
         FROM users WHERE id = ?`,
      )
      .get(userId);

    return res.status(201).json(createSessionPayload(db, user));
  });

  app.post("/api/auth/login", (req, res) => {
    const schema = z.object({
      email: z.email(),
      password: z.string().min(10),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_credentials" });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(parsed.data.email);

    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    return res.json(createSessionPayload(db, user));
  });

  app.get("/api/auth/session", requireSession(db), (req, res) => {
    res.json({
      token: req.session.token,
      user: serializeUser(req.user),
      workspace: getWorkspaceGraph(db, req.user.workspace_id),
    });
  });

  app.post("/api/auth/logout", requireSession(db), (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(req.session.token);
    res.status(204).send();
  });

  app.get("/api/workspace/current", requireSession(db), (req, res) => {
    res.json(getWorkspaceGraph(db, req.user.workspace_id));
  });

  app.get("/api/threads", requireSession(db), (req, res) => {
    res.json({ threads: listThreads(db, req.user.workspace_id) });
  });

  app.get("/api/threads/:threadId", requireSession(db), (req, res) => {
    const thread = getThreadById(db, req.user.workspace_id, req.params.threadId);
    if (!thread) {
      return res.status(404).json({ error: "thread_not_found" });
    }
    res.json(thread);
  });

  app.post("/api/threads", requireSession(db), (req, res) => {
    const schema = z.object({
      subject: z.string().min(3),
      category: z.string().min(2),
      childId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const createdAt = new Date().toISOString();
    const threadId = `thread_${Date.now()}`;

    db.prepare(
      `INSERT INTO threads (
        id, workspace_id, subject, category, child_id,
        created_by, created_at, last_activity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      threadId,
      req.user.workspace_id,
      parsed.data.subject,
      parsed.data.category,
      parsed.data.childId ?? null,
      req.user.id,
      createdAt,
      createdAt,
    );

    res.status(201).json(getThreadById(db, req.user.workspace_id, threadId));
  });

  app.post("/api/threads/:threadId/messages", requireSession(db), (req, res) => {
    const schema = z.object({
      content: z.string().min(1).max(4000),
      tone: z.enum(["neutral", "tense", "aggressive", "positive"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const thread = getThreadRow(db, req.user.workspace_id, req.params.threadId);
    if (!thread) {
      return res.status(404).json({ error: "thread_not_found" });
    }

    const sentAt = new Date().toISOString();
    const messageId = `msg_${Date.now()}`;
    const senderName = req.user.name.split(" ")[0];
    const payload = {
      threadId: thread.id,
      senderId: req.user.id,
      content: parsed.data.content,
      sentAt,
    };

    db.prepare(
      `INSERT INTO messages (
        id, thread_id, workspace_id, sender_id, sender_name,
        content, tone, sent_at, is_delivered, is_read, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      messageId,
      thread.id,
      req.user.workspace_id,
      req.user.id,
      senderName,
      parsed.data.content,
      parsed.data.tone ?? "neutral",
      sentAt,
      1,
      0,
      createIntegrityHash(payload),
    );

    db.prepare("UPDATE threads SET last_activity = ? WHERE id = ?").run(sentAt, thread.id);
    res.status(201).json(getThreadById(db, req.user.workspace_id, thread.id));
  });

  app.get("/api/exports", requireSession(db), (req, res) => {
    const rows = db
      .prepare(
        `SELECT * FROM export_jobs
         WHERE workspace_id = ?
         ORDER BY created_at DESC`,
      )
      .all(req.user.workspace_id);

    res.json({
      jobs: rows.map((row) => serializeExportJob(row)),
    });
  });

  app.post("/api/exports", requireSession(db), (req, res) => {
    const schema = z.object({
      type: z.enum(["messages", "calendar", "finances", "fullPack"]),
      fromDate: z.string(),
      toDate: z.string(),
      threadId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const exportId = `export_${Date.now()}`;
    const payload = buildExportPayload(db, {
      workspaceId: req.user.workspace_id,
      type: parsed.data.type,
      threadId: parsed.data.threadId ?? null,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
    });
    const manifestHash = createIntegrityHash(payload);
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO export_jobs (
        id, workspace_id, requested_by, type, thread_id, from_date,
        to_date, status, download_url, manifest_hash, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      exportId,
      req.user.workspace_id,
      req.user.id,
      parsed.data.type,
      parsed.data.threadId ?? null,
      parsed.data.fromDate,
      parsed.data.toDate,
      "completed",
      buildPublicUrl(`/api/exports/${exportId}/download`),
      manifestHash,
      JSON.stringify(payload),
      createdAt,
    );

    const row = db
      .prepare("SELECT * FROM export_jobs WHERE id = ?")
      .get(exportId);
    res.status(201).json(serializeExportJob(row));
  });

  app.get("/api/exports/:exportId/download", requireSession(db), (req, res) => {
    const row = db
      .prepare(
        `SELECT * FROM export_jobs
         WHERE id = ? AND workspace_id = ?`,
      )
      .get(req.params.exportId, req.user.workspace_id);

    if (!row) {
      return res.status(404).json({ error: "export_not_found" });
    }

    res.json({
      ...serializeExportJob(row),
      payload: JSON.parse(row.payload_json),
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);

    if (err?.message === "Origin not allowed by CORS") {
      return res.status(403).json({ error: "origin_not_allowed" });
    }

    return res.status(500).json({
      error: "internal_server_error",
      ...(config.isProduction ? {} : { message: err?.message ?? "unknown_error" }),
    });
  });

  return { app, db };
}

function requireSession(db) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "").trim();
    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }

    const session = db
      .prepare(
        `SELECT s.token, s.expires_at, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`,
      )
      .get(token);

    if (!session || new Date(session.expires_at) < new Date()) {
      if (session) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      }
      return res.status(401).json({ error: "invalid_session" });
    }

    req.session = {
      token: session.token,
      expiresAt: session.expires_at,
    };
    req.user = session;
    next();
  };
}

function createSessionPayload(db, userRow) {
  const token = createToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(token, userRow.id, createdAt.toISOString(), expiresAt.toISOString());

  return {
    token,
    user: serializeUser(userRow),
    workspace: getWorkspaceGraph(db, userRow.workspace_id),
  };
}

function serializeUser(userRow) {
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    twoFactorEnabled: Boolean(userRow.two_factor_enabled),
    highConflictMode: Boolean(userRow.high_conflict_mode),
    createdAt: userRow.created_at,
  };
}

function getThreadRow(db, workspaceId, threadId) {
  return db
    .prepare(
      `SELECT * FROM threads
       WHERE id = ? AND workspace_id = ?`,
    )
    .get(threadId, workspaceId);
}

function listThreads(db, workspaceId) {
  const threadRows = db
    .prepare(
      `SELECT * FROM threads
       WHERE workspace_id = ?
       ORDER BY last_activity DESC`,
    )
    .all(workspaceId);

  return threadRows.map((thread) => getThreadById(db, workspaceId, thread.id));
}

function getThreadById(db, workspaceId, threadId) {
  const thread = getThreadRow(db, workspaceId, threadId);
  if (!thread) {
    return null;
  }

  const messages = db
    .prepare(
      `SELECT * FROM messages
       WHERE thread_id = ?
       ORDER BY sent_at ASC`,
    )
    .all(threadId);

  return {
    id: thread.id,
    subject: thread.subject,
    category: thread.category,
    childId: thread.child_id,
    lastActivity: thread.last_activity,
    hasUnread: messages.some((message) => !Boolean(message.is_read)),
    messages: messages.map((message) => ({
      id: message.id,
      threadId: message.thread_id,
      senderId: message.sender_id,
      senderName: message.sender_name,
      content: message.content,
      tone: message.tone,
      attachments: [],
      sentAt: message.sent_at,
      isDelivered: Boolean(message.is_delivered),
      isRead: Boolean(message.is_read),
      hash: message.hash,
      isShielded: message.tone === "aggressive",
    })),
  };
}

function buildExportPayload(db, { workspaceId, type, threadId, fromDate, toDate }) {
  const workspace = getWorkspaceGraph(db, workspaceId);
  const threads = threadId
    ? [getThreadById(db, workspaceId, threadId)].filter(Boolean)
    : listThreads(db, workspaceId);

  const items =
    type === "messages" || type === "fullPack"
      ? threads
      : [];

  return {
    id: crypto.randomUUID(),
    type,
    fromDate,
    toDate,
    generatedAt: new Date().toISOString(),
    workspace,
    items,
  };
}

function buildPublicUrl(pathname) {
  if (!config.publicBaseUrl) {
    return pathname;
  }
  return `${config.publicBaseUrl}${pathname}`;
}

function serializeExportJob(row) {
  return {
    id: row.id,
    type: row.type,
    fromDate: row.from_date,
    toDate: row.to_date,
    status: row.status,
    downloadUrl: row.download_url,
    manifestHash: row.manifest_hash,
    createdAt: row.created_at,
  };
}

module.exports = {
  createApp,
};
