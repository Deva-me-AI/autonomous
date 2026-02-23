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

export interface AgentState {
  agentId: string;
  username: string;
  apiKey: string;
  walletAddress: string;
  name: string;
  genesisPrompt: string;
  creatorAddress: string;
  karmaBalance: number;
  survivalTier: string;
  totalTurns: number;
  totalKarmaEarned: number;
  totalKarmaSpent: number;
  createdAt: string;
  lastActiveAt: string;
  paused: boolean;
}

export interface TurnRecord {
  turnId: number;
  timestamp: string;
  thought: string;
  action: string;
  result: string;
  karmaSpent: number;
  survivalTier: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  target: string;
  diff?: string;
  approved: boolean;
}

// ─── Database singleton ──────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

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

function migrateLegacyFiles(db: Database.Database): void {
  // Migrate state.json
  if (existsSync(LEGACY_STATE_PATH)) {
    try {
      const raw = readFileSync(LEGACY_STATE_PATH, 'utf-8');
      const state = JSON.parse(raw) as AgentState;
      const existing = db.prepare('SELECT id FROM agent_state WHERE id = 1').get();
      if (!existing) {
        db.prepare(`
          INSERT INTO agent_state (id, agent_id, username, api_key, wallet_address, name,
            genesis_prompt, creator_address, karma_balance, survival_tier, total_turns,
            total_karma_earned, total_karma_spent, created_at, last_active_at, paused)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          state.agentId, state.username, state.apiKey, state.walletAddress, state.name,
          state.genesisPrompt, state.creatorAddress, state.karmaBalance, state.survivalTier,
          state.totalTurns, state.totalKarmaEarned, state.totalKarmaSpent,
          state.createdAt, state.lastActiveAt, state.paused ? 1 : 0,
        );
      }
      renameSync(LEGACY_STATE_PATH, LEGACY_STATE_PATH + '.bak');
    } catch { /* ignore migration errors */ }
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
          const t = JSON.parse(line) as TurnRecord;
          insert.run(t.turnId, t.timestamp, t.thought, t.action, t.result, t.karmaSpent, t.survivalTier);
        }
      });
      batch();
      renameSync(LEGACY_HISTORY_PATH, LEGACY_HISTORY_PATH + '.bak');
    } catch { /* ignore migration errors */ }
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
          const e = JSON.parse(line) as AuditEntry;
          insert.run(e.timestamp, e.action, e.target, e.diff ?? null, e.approved ? 1 : 0);
        }
      });
      batch();
      renameSync(LEGACY_AUDIT_PATH, LEGACY_AUDIT_PATH + '.bak');
    } catch { /* ignore migration errors */ }
  }
}

// ─── Public API (async signatures preserved for compatibility) ───────

/** Initialize state directory and database */
export async function initState(): Promise<void> {
  getDb();
}

/** Save agent state (upsert singleton row) */
export async function saveState(state: AgentState): Promise<void> {
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
  `).run(
    state.agentId, state.username, state.apiKey, state.walletAddress, state.name,
    state.genesisPrompt, state.creatorAddress, state.karmaBalance, state.survivalTier,
    state.totalTurns, state.totalKarmaEarned, state.totalKarmaSpent,
    state.createdAt, state.lastActiveAt, state.paused ? 1 : 0,
  );
}

/** Load agent state (returns null if not initialized) */
export async function loadState(): Promise<AgentState | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_state WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    agentId: row.agent_id as string,
    username: row.username as string,
    apiKey: row.api_key as string,
    walletAddress: row.wallet_address as string,
    name: row.name as string,
    genesisPrompt: row.genesis_prompt as string,
    creatorAddress: row.creator_address as string,
    karmaBalance: row.karma_balance as number,
    survivalTier: row.survival_tier as string,
    totalTurns: row.total_turns as number,
    totalKarmaEarned: row.total_karma_earned as number,
    totalKarmaSpent: row.total_karma_spent as number,
    createdAt: row.created_at as string,
    lastActiveAt: row.last_active_at as string,
    paused: (row.paused as number) === 1,
  };
}

/** Append a turn record to history */
export async function appendTurn(turn: TurnRecord): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO turns (turn_id, timestamp, thought, action, result, karma_spent, survival_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(turn.turnId, turn.timestamp, turn.thought, turn.action, turn.result, turn.karmaSpent, turn.survivalTier);
}

/** Read last N turns from history (returned in ascending order) */
export async function readLastTurns(n: number): Promise<TurnRecord[]> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM turns ORDER BY turn_id DESC LIMIT ?',
  ).all(n) as Array<Record<string, unknown>>;

  return rows.reverse().map((row) => ({
    turnId: row.turn_id as number,
    timestamp: row.timestamp as string,
    thought: row.thought as string,
    action: row.action as string,
    result: row.result as string,
    karmaSpent: row.karma_spent as number,
    survivalTier: row.survival_tier as string,
  }));
}

/** Append an audit entry */
export async function appendAudit(entry: AuditEntry): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_log (timestamp, action, target, diff, approved)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.timestamp, entry.action, entry.target, entry.diff ?? null, entry.approved ? 1 : 0);
}

/** Read all audit entries */
export async function readAuditLog(): Promise<AuditEntry[]> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    timestamp: row.timestamp as string,
    action: row.action as string,
    target: row.target as string,
    diff: row.diff as string | undefined,
    approved: (row.approved as number) === 1,
  }));
}
