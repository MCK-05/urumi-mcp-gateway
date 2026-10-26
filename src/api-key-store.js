const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const DB_PATH =
  process.env.API_KEY_DB_PATH ||
  path.join(process.cwd(), "data", "api-keys.sqlite");
let db;
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
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
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    )
  `);
}
function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}
async function issueApiKey(userId) {
  await initDb();
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("A non-empty user ID is required.");
  }
  const apiKey = crypto.randomBytes(32).toString("hex");
  const keyHash = hashApiKey(apiKey);
  const result = await run(
    "INSERT INTO api_keys (user_id, key_hash) VALUES (?, ?)",
    [userId.trim(), keyHash]
  );
  // Return the plaintext key only once, at creation time.
  return {
    id: result.lastID,
    userId: userId.trim(),
    apiKey
  };
}
async function validateApiKey(apiKey) {
  await initDb();
  if (typeof apiKey !== "string" || !/^[a-f0-9]{64}$/i.test(apiKey)) {
    return null;
  }
  const row = await get(
    `SELECT id, user_id, created_at
     FROM api_keys
     WHERE key_hash = ? AND revoked_at IS NULL`,
    [hashApiKey(apiKey)]
  );
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at
  };
}
async function revokeApiKey(id) {
  await initDb();
  const result = await run(
    `UPDATE api_keys
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revoked_at IS NULL`,
    [id]
  );
  return result.changes === 1;
}
async function listApiKeys() {
  await initDb();
  return all(
    `SELECT id, user_id AS userId, created_at AS createdAt,
            revoked_at AS revokedAt
     FROM api_keys
     ORDER BY id DESC`
  );
}
module.exports = {
  initDb,
  issueApiKey,
  validateApiKey,
  revokeApiKey,
  listApiKeys
};
