/**
 * SQLite persistence — agent state, turn history, audit log.
 * Uses a simple JSON-file approach for v0.1 (swap to better-sqlite3 later).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const AUTONOMOUS_DIR = join(process.env.HOME || '~', '.autonomous');
const STATE_PATH = join(AUTONOMOUS_DIR, 'state.json');
const HISTORY_PATH = join(AUTONOMOUS_DIR, 'history.jsonl');
const AUDIT_PATH = join(AUTONOMOUS_DIR, 'audit.jsonl');

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

/** Initialize state directory */
export async function initState(): Promise<void> {
  await mkdir(AUTONOMOUS_DIR, { recursive: true });
}

/** Save agent state */
export async function saveState(state: AgentState): Promise<void> {
  await mkdir(AUTONOMOUS_DIR, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

/** Load agent state (returns null if not initialized) */
export async function loadState(): Promise<AgentState | null> {
  if (!existsSync(STATE_PATH)) return null;
  const raw = await readFile(STATE_PATH, 'utf-8');
  return JSON.parse(raw) as AgentState;
}

/** Append a turn record to history */
export async function appendTurn(turn: TurnRecord): Promise<void> {
  await mkdir(AUTONOMOUS_DIR, { recursive: true });
  const line = JSON.stringify(turn) + '\n';
  const { appendFile } = await import('node:fs/promises');
  await appendFile(HISTORY_PATH, line, 'utf-8');
}

/** Read last N turns from history */
export async function readLastTurns(n: number): Promise<TurnRecord[]> {
  if (!existsSync(HISTORY_PATH)) return [];
  const raw = await readFile(HISTORY_PATH, 'utf-8');
  const lines = raw.trim().split('\n').filter(Boolean);
  return lines.slice(-n).map((l) => JSON.parse(l) as TurnRecord);
}

/** Append an audit entry */
export async function appendAudit(entry: AuditEntry): Promise<void> {
  await mkdir(AUTONOMOUS_DIR, { recursive: true });
  const line = JSON.stringify(entry) + '\n';
  const { appendFile } = await import('node:fs/promises');
  await appendFile(AUDIT_PATH, line, 'utf-8');
}

/** Read all audit entries */
export async function readAuditLog(): Promise<AuditEntry[]> {
  if (!existsSync(AUDIT_PATH)) return [];
  const raw = await readFile(AUDIT_PATH, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AuditEntry);
}
