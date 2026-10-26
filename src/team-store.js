const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");

const DB_PATH = process.env.TEAM_DB_PATH ||
  process.env.API_KEY_DB_PATH ||
  path.join(process.cwd(), "data", "api-keys.sqlite");
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
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
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}
function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) return reject(error);
      resolve({ salt, hash: key.toString("hex") });
    });
  });
}
async function verifyPassword(password, salt, expected) {
  const actual = await passwordHash(password, salt);
  const a = Buffer.from(actual.hash, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });
    db = await new Promise((resolve, reject) => {
      const connection = new sqlite3.Database(DB_PATH, error => error ? reject(error) : resolve(connection));
    });
    await run(`CREATE TABLE IF NOT EXISTS team_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member')),
      disabled_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS team_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES team_users(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS team_invites (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member')),
      expires_at INTEGER NOT NULL,
      used_at TEXT
    )`);
  })();
  try { await initPromise; } catch (error) { initPromise = null; db = null; throw error; }
}
async function bootstrapAdmin(email, password) {
  await init();
  const count = await get("SELECT COUNT(*) AS count FROM team_users");
  if (count.count > 0 || !email || !password || String(password).length < 12) return false;
  const normalized = String(email).trim().toLowerCase();
  const { salt, hash } = await passwordHash(String(password));
  await run("INSERT INTO team_users(email,password_salt,password_hash,role) VALUES(?,?,?,'admin')", [normalized, salt, hash]);
  return true;
}
async function login(email, password) {
  await init();
  const user = await get("SELECT * FROM team_users WHERE email = ? AND disabled_at IS NULL", [String(email || "").trim().toLowerCase()]);
  if (!user || !(await verifyPassword(String(password || ""), user.password_salt, user.password_hash))) return null;
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO team_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", [digest(token), user.id, Date.now() + SESSION_TTL_MS]);
  return { token, user: { id: user.id, email: user.email, role: user.role } };
}
async function authenticate(token) {
  await init();
  if (!token || typeof token !== "string") return null;
  const row = await get(`SELECT u.id,u.email,u.role,s.expires_at
    FROM team_sessions s JOIN team_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND u.disabled_at IS NULL`, [digest(token)]);
  if (!row || row.expires_at < Date.now()) {
    if (row) await run("DELETE FROM team_sessions WHERE token_hash=?", [digest(token)]);
    return null;
  }
  return { id: row.id, email: row.email, role: row.role };
}
async function logout(token) {
  await init();
  if (token) await run("DELETE FROM team_sessions WHERE token_hash=?", [digest(token)]);
}
async function createInvite(email, role = "member") {
  await init();
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email address is required.");
  if (!["admin", "member"].includes(role)) throw new Error("Invalid role.");
  const existing = await get("SELECT id FROM team_users WHERE email=?", [normalized]);
  if (existing) throw new Error("A team member with this email already exists.");
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO team_invites(token_hash,email,role,expires_at) VALUES(?,?,?,?)", [digest(token), normalized, role, Date.now() + 24 * 60 * 60 * 1000]);
  return { email: normalized, role, inviteToken: token, expiresInHours: 24 };
}
async function acceptInvite(token, password) {
  await init();
  if (typeof password !== "string" || password.length < 12) throw new Error("Password must contain at least 12 characters.");
  const invite = await get("SELECT * FROM team_invites WHERE token_hash=? AND used_at IS NULL", [digest(String(token || ""))]);
  if (!invite || invite.expires_at < Date.now()) throw new Error("Invite is invalid or expired.");
  const { salt, hash } = await passwordHash(password);
  await run("INSERT INTO team_users(email,password_salt,password_hash,role) VALUES(?,?,?,?)", [invite.email, salt, hash, invite.role]);
  await run("UPDATE team_invites SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?", [invite.token_hash]);
  return { email: invite.email, role: invite.role };
}
async function listUsers() {
  await init();
  return all("SELECT id,email,role,created_at AS createdAt,disabled_at AS disabledAt FROM team_users ORDER BY id");
}
async function setUserDisabled(id, disabled) {
  await init();
  const result = await run("UPDATE team_users SET disabled_at=? WHERE id=? AND role!='admin'", [disabled ? new Date().toISOString() : null, id]);
  if (disabled) await run("DELETE FROM team_sessions WHERE user_id=?", [id]);
  return result.changes === 1;
}
module.exports = { init, bootstrapAdmin, login, authenticate, logout, createInvite, acceptInvite, listUsers, setUserDisabled };
