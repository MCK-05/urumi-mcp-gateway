
const path = require("node:path");
const fs = require("node:fs");
const sqlite3 = require("sqlite3");

const DB_PATH =
  process.env.AUDIT_LOG_DB_PATH ||
  path.join(process.cwd(), "data", "audit-logs.sqlite");

let db;
let initPromise;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

async function initDb() {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (DB_PATH !== ":memory:") {
      fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), {
        recursive: true
      });
    }

    db = await new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(DB_PATH, (error) => {
        if (error) return reject(error);
        resolve(connection);
      });
    });

    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        server_name TEXT NOT NULL DEFAULT 'unknown',
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN ('success', 'error')),
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        duration_ms INTEGER NOT NULL
      )
    `);
    const columns = await new Promise((resolve, reject) => db.all("PRAGMA table_info(audit_logs)", (error, rows) => error ? reject(error) : resolve(rows)));
    if (!columns.some(column => column.name === "server_name")) await run("ALTER TABLE audit_logs ADD COLUMN server_name TEXT NOT NULL DEFAULT 'unknown'");
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    db = null;
    throw error;
  }
}

async function recordToolCall({
  userId,
  serverName = "unknown",
  toolName,
  status,
  durationMs
}) {
  await initDb();

  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("A valid audit user ID is required.");
  }

  if (typeof serverName !== "string" || !serverName.trim()) throw new Error("A valid audit server name is required.");
  if (typeof toolName !== "string" || !toolName.trim()) {
    throw new Error("A valid tool name is required.");
  }

  if (!["success", "error"].includes(status)) {
    throw new Error("Invalid audit status.");
  }

  const safeDuration = Number.isFinite(durationMs)
    ? Math.max(0, Math.round(durationMs))
    : 0;

  const result = await run(
    `INSERT INTO audit_logs
      (user_id, server_name, tool_name, status, duration_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [userId.trim(), serverName.trim(), toolName.trim(), status, safeDuration]
  );

  return { id: result.lastID };
}

async function listAuditLogs(limit = 100) {
  await initDb();

  const safeLimit = Math.min(
    500,
    Math.max(1, Math.floor(Number(limit) || 100))
  );

  return all(
    `SELECT id, user_id AS userId,
            server_name AS serverName, tool_name AS toolName, status,
            timestamp, duration_ms AS durationMs
     FROM audit_logs
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit]
  );
}

module.exports = {
  initDb,
  recordToolCall,
  listAuditLogs
};
