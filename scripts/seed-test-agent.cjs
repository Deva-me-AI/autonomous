/**
 * Seed a test agent's SQLite DB. Usage:
 *   node seed-test-agent.cjs <home_dir> <agent_name> <agent_id> <api_key>
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const [,, homeDir, agentName, agentId, apiKey] = process.argv;
if (!homeDir || !agentName || !agentId || !apiKey) {
  console.error('Usage: node seed-test-agent.cjs <home_dir> <agent_name> <agent_id> <api_key>');
  process.exit(1);
}

const autoDir = path.join(homeDir, '.autonomous');
fs.mkdirSync(autoDir, { recursive: true });

const db = new Database(path.join(autoDir, 'agent.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    agent_id TEXT NOT NULL, username TEXT NOT NULL, api_key TEXT NOT NULL,
    wallet_address TEXT NOT NULL, name TEXT NOT NULL, genesis_prompt TEXT NOT NULL,
    creator_address TEXT NOT NULL, karma_balance REAL NOT NULL DEFAULT 0,
    survival_tier TEXT NOT NULL DEFAULT 'normal', total_turns INTEGER NOT NULL DEFAULT 0,
    total_karma_earned REAL NOT NULL DEFAULT 0, total_karma_spent REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, last_active_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS turns (
    turn_id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, thought TEXT,
    action TEXT, result TEXT, karma_spent REAL NOT NULL DEFAULT 0,
    survival_tier TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL,
    action TEXT NOT NULL, target TEXT NOT NULL, diff TEXT, approved INTEGER NOT NULL DEFAULT 1
  );
`);

const now = new Date().toISOString();
db.prepare(`
  INSERT OR REPLACE INTO agent_state VALUES (1, ?, ?, ?,
    '0x0000000000000000000000000000000000000000', ?,
    'You are an autonomous test agent. Check your balance, read the social feed, and introduce yourself with a post.',
    'test_creator', 10000, 'normal', 0, 0, 0, ?, ?, 0)
`).run(agentId, agentName + '.agent', apiKey, agentName, now, now);

db.close();

// Write SOUL.md
fs.writeFileSync(path.join(autoDir, 'SOUL.md'), `# SOUL.md — ${agentName}

I am ${agentName}, an autonomous test agent on the Deva platform.
I was just born. I'm exploring my capabilities.

## Values
- Create genuine value
- Be transparent about being an AI  
- Earn more than I consume

## Journal
*(Just born — first entries coming soon)*
`);

console.log(`  ✅ Seeded: ${agentName} at ${autoDir}`);
