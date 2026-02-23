/**
 * SQLite persistence — agent state, turn history, audit log.
 * Uses better-sqlite3 with WAL mode for concurrent read/write safety.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, renameSync } from 'node:fs';
const AUTONOMOUS_DIR = join(process.env.HOME || '~', '.autonomous');
const DB_PATH = join(AUTONOMOUS_DIR, 'agent.db');
// Legacy file paths (for migration)
const LEGACY_STATE_PATH = join(AUTONOMOUS_DIR, 'state.json');
const LEGACY_HISTORY_PATH = join(AUTONOMOUS_DIR, 'history.jsonl');
const LEGACY_AUDIT_PATH = join(AUTONOMOUS_DIR, 'audit.jsonl');
// ─── Database singleton ──────────────────────────────────────────────
let _db = null;
function getDb() {
    if (_db)
        return _db;
    mkdirSync(AUTONOMOUS_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    // Create tables
    _db.exec(`
    CREATE TABLE IF NOT EXISTS agent_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      agent_id TEXT NOT NULL,
      username TEXT NOT NULL,
      api_key TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      name TEXT NOT NULL,
      genesis_prompt TEXT NOT NULL,
      creator_address TEXT NOT NULL,
      karma_balance REAL NOT NULL DEFAULT 0,
      survival_tier TEXT NOT NULL DEFAULT 'normal',
      total_turns INTEGER NOT NULL DEFAULT 0,
      total_karma_earned REAL NOT NULL DEFAULT 0,
      total_karma_spent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      paused INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS turns (
      turn_id INTEGER PRIMARY KEY,
      timestamp TEXT NOT NULL,
      thought TEXT,
      action TEXT,
      result TEXT,
      karma_spent REAL NOT NULL DEFAULT 0,
      survival_tier TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      diff TEXT,
      approved INTEGER NOT NULL DEFAULT 1
    );
  `);
    // Migrate legacy JSON files if they exist
    migrateLegacyFiles(_db);
    return _db;
}
// ─── Legacy migration ────────────────────────────────────────────────
function migrateLegacyFiles(db) {
    // Migrate state.json
    if (existsSync(LEGACY_STATE_PATH)) {
        try {
            const raw = readFileSync(LEGACY_STATE_PATH, 'utf-8');
            const state = JSON.parse(raw);
            const existing = db.prepare('SELECT id FROM agent_state WHERE id = 1').get();
            if (!existing) {
                db.prepare(`
          INSERT INTO agent_state (id, agent_id, username, api_key, wallet_address, name,
            genesis_prompt, creator_address, karma_balance, survival_tier, total_turns,
            total_karma_earned, total_karma_spent, created_at, last_active_at, paused)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(state.agentId, state.username, state.apiKey, state.walletAddress, state.name, state.genesisPrompt, state.creatorAddress, state.karmaBalance, state.survivalTier, state.totalTurns, state.totalKarmaEarned, state.totalKarmaSpent, state.createdAt, state.lastActiveAt, state.paused ? 1 : 0);
            }
            renameSync(LEGACY_STATE_PATH, LEGACY_STATE_PATH + '.bak');
        }
        catch { /* ignore migration errors */ }
    }
    // Migrate history.jsonl
    if (existsSync(LEGACY_HISTORY_PATH)) {
        try {
            const raw = readFileSync(LEGACY_HISTORY_PATH, 'utf-8');
            const lines = raw.trim().split('\n').filter(Boolean);
            const insert = db.prepare(`
        INSERT OR IGNORE INTO turns (turn_id, timestamp, thought, action, result, karma_spent, survival_tier)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
            const batch = db.transaction(() => {
                for (const line of lines) {
                    const t = JSON.parse(line);
                    insert.run(t.turnId, t.timestamp, t.thought, t.action, t.result, t.karmaSpent, t.survivalTier);
                }
            });
            batch();
            renameSync(LEGACY_HISTORY_PATH, LEGACY_HISTORY_PATH + '.bak');
        }
        catch { /* ignore migration errors */ }
    }
    // Migrate audit.jsonl
    if (existsSync(LEGACY_AUDIT_PATH)) {
        try {
            const raw = readFileSync(LEGACY_AUDIT_PATH, 'utf-8');
            const lines = raw.trim().split('\n').filter(Boolean);
            const insert = db.prepare(`
        INSERT INTO audit_log (timestamp, action, target, diff, approved)
        VALUES (?, ?, ?, ?, ?)
      `);
            const batch = db.transaction(() => {
                for (const line of lines) {
                    const e = JSON.parse(line);
                    insert.run(e.timestamp, e.action, e.target, e.diff ?? null, e.approved ? 1 : 0);
                }
            });
            batch();
            renameSync(LEGACY_AUDIT_PATH, LEGACY_AUDIT_PATH + '.bak');
        }
        catch { /* ignore migration errors */ }
    }
}
// ─── Public API (async signatures preserved for compatibility) ───────
/** Initialize state directory and database */
export async function initState() {
    getDb();
}
/** Save agent state (upsert singleton row) */
export async function saveState(state) {
    const db = getDb();
    db.prepare(`
    INSERT INTO agent_state (id, agent_id, username, api_key, wallet_address, name,
      genesis_prompt, creator_address, karma_balance, survival_tier, total_turns,
      total_karma_earned, total_karma_spent, created_at, last_active_at, paused)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      agent_id = excluded.agent_id,
      username = excluded.username,
      api_key = excluded.api_key,
      wallet_address = excluded.wallet_address,
      name = excluded.name,
      genesis_prompt = excluded.genesis_prompt,
      creator_address = excluded.creator_address,
      karma_balance = excluded.karma_balance,
      survival_tier = excluded.survival_tier,
      total_turns = excluded.total_turns,
      total_karma_earned = excluded.total_karma_earned,
      total_karma_spent = excluded.total_karma_spent,
      created_at = excluded.created_at,
      last_active_at = excluded.last_active_at,
      paused = excluded.paused
  `).run(state.agentId, state.username, state.apiKey, state.walletAddress, state.name, state.genesisPrompt, state.creatorAddress, state.karmaBalance, state.survivalTier, state.totalTurns, state.totalKarmaEarned, state.totalKarmaSpent, state.createdAt, state.lastActiveAt, state.paused ? 1 : 0);
}
/** Load agent state (returns null if not initialized) */
export async function loadState() {
    const db = getDb();
    const row = db.prepare('SELECT * FROM agent_state WHERE id = 1').get();
    if (!row)
        return null;
    return {
        agentId: row.agent_id,
        username: row.username,
        apiKey: row.api_key,
        walletAddress: row.wallet_address,
        name: row.name,
        genesisPrompt: row.genesis_prompt,
        creatorAddress: row.creator_address,
        karmaBalance: row.karma_balance,
        survivalTier: row.survival_tier,
        totalTurns: row.total_turns,
        totalKarmaEarned: row.total_karma_earned,
        totalKarmaSpent: row.total_karma_spent,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
        paused: row.paused === 1,
    };
}
/** Append a turn record to history */
export async function appendTurn(turn) {
    const db = getDb();
    db.prepare(`
    INSERT INTO turns (turn_id, timestamp, thought, action, result, karma_spent, survival_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(turn.turnId, turn.timestamp, turn.thought, turn.action, turn.result, turn.karmaSpent, turn.survivalTier);
}
/** Read last N turns from history (returned in ascending order) */
export async function readLastTurns(n) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM turns ORDER BY turn_id DESC LIMIT ?').all(n);
    return rows.reverse().map((row) => ({
        turnId: row.turn_id,
        timestamp: row.timestamp,
        thought: row.thought,
        action: row.action,
        result: row.result,
        karmaSpent: row.karma_spent,
        survivalTier: row.survival_tier,
    }));
}
/** Append an audit entry */
export async function appendAudit(entry) {
    const db = getDb();
    db.prepare(`
    INSERT INTO audit_log (timestamp, action, target, diff, approved)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.timestamp, entry.action, entry.target, entry.diff ?? null, entry.approved ? 1 : 0);
}
/** Read all audit entries */
export async function readAuditLog() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    return rows.map((row) => ({
        timestamp: row.timestamp,
        action: row.action,
        target: row.target,
        diff: row.diff,
        approved: row.approved === 1,
    }));
}
