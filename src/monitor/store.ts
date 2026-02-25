import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { MonitoredPost, MonitorPostStatus, ScoringResult } from './types.js';

export interface StoredPostRecord extends MonitoredPost, ScoringResult {
  status: MonitorPostStatus;
  created_at: string;
  updated_at: string;
}

const ALLOWED_TRANSITIONS: Record<MonitorPostStatus, MonitorPostStatus[]> = {
  new: ['scored', 'skipped', 'rejected'],
  scored: ['candidate', 'skipped', 'rejected'],
  candidate: ['engaged', 'skipped', 'rejected'],
  engaged: [],
  skipped: [],
  rejected: [],
};

let monitorDb: Database.Database | null = null;

function getDb(): Database.Database {
  if (!monitorDb) {
    throw new Error('Monitor DB not initialized. Call initMonitorDb(dbPath) first.');
  }
  return monitorDb;
}

export function initMonitorDb(dbPath: string): void {
  const absolutePath = resolve(dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  monitorDb = new Database(absolutePath);
  monitorDb.pragma('journal_mode = WAL');

  monitorDb.exec(`
    CREATE TABLE IF NOT EXISTS posts_seen (
      platform TEXT NOT NULL,
      post_id TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      matched_features_json TEXT NOT NULL,
      explanation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (platform, post_id)
    );

    CREATE TABLE IF NOT EXISTS monitor_runs (
      run_id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      scored_count INTEGER NOT NULL DEFAULT 0,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_posts_seen_platform_score
      ON posts_seen (platform, score DESC);

    CREATE INDEX IF NOT EXISTS idx_posts_seen_platform_status
      ON posts_seen (platform, status);
  `);
}

export function upsertPost(post: MonitoredPost & ScoringResult): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO posts_seen (
      platform,
      post_id,
      author,
      content,
      raw_text,
      timestamp,
      metadata_json,
      score,
      matched_features_json,
      explanation,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scored', ?, ?)
    ON CONFLICT(platform, post_id) DO UPDATE SET
      author = excluded.author,
      content = excluded.content,
      raw_text = excluded.raw_text,
      timestamp = excluded.timestamp,
      metadata_json = excluded.metadata_json,
      score = excluded.score,
      matched_features_json = excluded.matched_features_json,
      explanation = excluded.explanation,
      updated_at = excluded.updated_at
  `).run(
    post.platform,
    post.id,
    post.author,
    post.content,
    post.raw_text,
    post.timestamp,
    JSON.stringify(post.metadata),
    post.score,
    JSON.stringify(post.matched_features),
    post.explanation,
    now,
    now,
  );
}

export function getPostsByScore(platform: string, minScore: number, limit: number): StoredPostRecord[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT *
    FROM posts_seen
    WHERE platform = ?
      AND score >= ?
      AND status IN ('scored', 'candidate')
    ORDER BY score DESC, timestamp DESC
    LIMIT ?
  `).all(platform, minScore, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    platform: row.platform as string,
    id: row.post_id as string,
    author: row.author as string,
    content: row.content as string,
    raw_text: row.raw_text as string,
    timestamp: row.timestamp as string,
    metadata: JSON.parse(row.metadata_json as string) as Record<string, unknown>,
    score: row.score as number,
    matched_features: JSON.parse(row.matched_features_json as string) as string[],
    explanation: row.explanation as string,
    status: row.status as MonitorPostStatus,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
}

export function markPostStatus(platform: string, postId: string, status: MonitorPostStatus): void {
  const db = getDb();
  const existing = db.prepare(`
    SELECT status
    FROM posts_seen
    WHERE platform = ? AND post_id = ?
  `).get(platform, postId) as { status?: MonitorPostStatus } | undefined;

  if (!existing?.status) {
    throw new Error(`Cannot update status. Post not found: ${platform}/${postId}`);
  }

  if (existing.status === status) {
    return;
  }

  const allowed = ALLOWED_TRANSITIONS[existing.status];
  if (!allowed.includes(status)) {
    throw new Error(
      `Invalid status transition for ${platform}/${postId}: ${existing.status} -> ${status}`,
    );
  }

  db.prepare(`
    UPDATE posts_seen
    SET status = ?, updated_at = ?
    WHERE platform = ? AND post_id = ?
  `).run(status, new Date().toISOString(), platform, postId);
}
