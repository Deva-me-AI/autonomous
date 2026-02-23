#!/usr/bin/env node
/**
 * Deva Autonomous Agent — entry point.
 *
 * Usage:
 *   deva-autonomous --run          Start the agent loop
 *   deva-autonomous --setup        Run first-time setup wizard
 *   deva-autonomous --status       Show current status
 *   deva-autonomous --soul         Print SOUL.md
 *   deva-autonomous --help         Show help
 */

import { loadState } from './state/db.js';
import { runSetup } from './setup/wizard.js';
import { runLoop } from './agent/loop.js';
import { readSoul } from './identity/soul.js';
import { getTier, getTierConfig, estimateTimeToDeathMs } from './survival/tiers.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import openClawPlugin from './openclaw/plugin.js';

export { openClawPlugin };
export default openClawPlugin;

const args = process.argv.slice(2);
const command = args[0] || '--help';

async function main() {
  switch (command) {
    case '--run':
    case 'run': {
      const state = await loadState();
      if (!state) {
        console.log('No agent state found. Running setup wizard...\n');
        await runSetup();
        console.log('Setup complete. Starting agent loop...\n');
      }
      await runLoop({
        maxTurns: args.includes('--max-turns')
          ? parseInt(args[args.indexOf('--max-turns') + 1], 10)
          : 0,
        onTurn: (turn) => {
          // Could hook into external logging here
        },
        onDeath: (state) => {
          console.log(`\n💀 ${state.name} has died after ${state.totalTurns} turns.`);
          console.log(`   Earned: ${state.totalKarmaEarned} ₭ | Spent: ${state.totalKarmaSpent} ₭`);
          process.exit(0);
        },
        onTierChange: (oldTier, newTier) => {
          console.log(`\n⚠️  Survival tier: ${oldTier} → ${newTier}`);
        },
      });
      break;
    }

    case '--setup':
    case 'setup': {
      await runSetup();
      break;
    }

    case '--status':
    case 'status': {
      const state = await loadState();
      if (!state) {
        console.log('No agent found. Run `deva-autonomous --setup` first.');
        process.exit(1);
      }

      const tier = getTier(state.karmaBalance);
      const config = getTierConfig(state.karmaBalance);
      const avgCostPerTurn = state.totalTurns > 0
        ? state.totalKarmaSpent / state.totalTurns
        : 0;
      const ttd = estimateTimeToDeathMs(state.karmaBalance, avgCostPerTurn);
      const ttdHuman = ttd === Infinity ? '∞' : `${Math.round(ttd / 3_600_000)}h`;

      console.log(`\n🤖 ${state.name} (${state.username})`);
      console.log(`   Agent ID: ${state.agentId}`);
      console.log(`   Wallet: ${state.walletAddress}`);
      console.log(`   Creator: ${state.creatorAddress}`);
      console.log(`\n💰 Karma: ${state.karmaBalance} ₭ ($${(state.karmaBalance / 1000).toFixed(3)})`);
      console.log(`   Tier: ${tier.toUpperCase()} — ${config.description}`);
      console.log(`   Earned: ${state.totalKarmaEarned} ₭ | Spent: ${state.totalKarmaSpent} ₭`);
      console.log(`   Avg cost/turn: ${avgCostPerTurn.toFixed(1)} ₭`);
      console.log(`   Time to death: ${ttdHuman}`);
      console.log(`\n📊 Turns: ${state.totalTurns} | Paused: ${state.paused}`);
      console.log(`   Created: ${state.createdAt}`);
      console.log(`   Last active: ${state.lastActiveAt}\n`);
      break;
    }

    case '--soul':
    case 'soul': {
      const soul = await readSoul();
      console.log(soul);
      break;
    }

    case '--pause':
    case 'pause': {
      const state = await loadState();
      if (!state) { console.log('No agent found.'); process.exit(1); }
      state.paused = true;
      const { saveState: save } = await import('./state/db.js');
      await save(state);
      console.log('⏸️  Agent paused.');
      break;
    }

    case '--resume':
    case 'resume': {
      const state = await loadState();
      if (!state) { console.log('No agent found.'); process.exit(1); }
      state.paused = false;
      const { saveState: save } = await import('./state/db.js');
      await save(state);
      console.log('▶️  Agent resumed.');
      break;
    }

    case '--help':
    case 'help':
    default:
      console.log(`
🧬 Deva Autonomous Agent v0.1.0

Usage:
  deva-autonomous --run [--max-turns N]    Start the agent loop
  deva-autonomous --setup                  Run first-time setup wizard
  deva-autonomous --status                 Show current status
  deva-autonomous --soul                   Print SOUL.md
  deva-autonomous --pause                  Pause the agent loop
  deva-autonomous --resume                 Resume the agent loop
  deva-autonomous --help                   Show this help

The first AI that earns its own existence on the Deva platform.
https://github.com/Deva-me-AI/autonomous
`);
  }
}

function isCliEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
