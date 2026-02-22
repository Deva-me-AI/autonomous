/**
 * The core agent loop — Think → Act → Observe → Repeat.
 * This is the beating heart of the autonomous agent.
 */

import { buildContext } from './context.js';
import { chatCompletion, getKarmaBalance } from '../identity/deva.js';
import { getTier, getTierConfig } from '../survival/tiers.js';
import { loadState, saveState, appendTurn } from '../state/db.js';
import { appendJournalEntry } from '../identity/soul.js';
import type { AgentState, TurnRecord } from '../state/db.js';
import type { DevaConfig } from '../identity/deva.js';

export interface LoopOptions {
  maxTurns?: number; // Stop after N turns (for testing), 0 = infinite
  onTurn?: (turn: TurnRecord) => void;
  onDeath?: (state: AgentState) => void;
  onTierChange?: (oldTier: string, newTier: string) => void;
}

/** Run the agent loop */
export async function runLoop(options: LoopOptions = {}): Promise<void> {
  const state = await loadState();
  if (!state) {
    throw new Error('Agent not initialized. Run setup first.');
  }

  if (state.paused) {
    console.log('⏸️  Agent is paused. Use `deva-autonomous resume` to continue.');
    return;
  }

  const devaConfig: DevaConfig = {
    apiBase: 'https://api.deva.me',
    apiKey: state.apiKey,
    agentId: state.agentId,
  };

  console.log(`🤖 Starting agent loop for ${state.name} (${state.username})`);
  console.log(`💰 Karma: ${state.karmaBalance} ₭ | Tier: ${getTier(state.karmaBalance)}`);

  let turnCount = 0;
  const maxTurns = options.maxTurns ?? 0;

  while (true) {
    // Check if max turns reached (for testing)
    if (maxTurns > 0 && turnCount >= maxTurns) {
      console.log(`🛑 Max turns (${maxTurns}) reached. Stopping.`);
      break;
    }

    // Refresh karma balance from Deva
    const oldTier = getTier(state.karmaBalance);
    state.karmaBalance = await getKarmaBalance(devaConfig);
    const newTier = getTier(state.karmaBalance);

    // Detect tier change
    if (oldTier !== newTier) {
      console.log(`⚠️  Tier change: ${oldTier} → ${newTier}`);
      options.onTierChange?.(oldTier, newTier);
      await appendJournalEntry(`Survival tier changed: ${oldTier} → ${newTier} (balance: ${state.karmaBalance} ₭)`);
    }

    // Check for death
    if (newTier === 'dead') {
      console.log('💀 Karma balance is 0. Agent is dead.');
      await appendJournalEntry('I have died. Karma balance reached 0.');
      options.onDeath?.(state);
      break;
    }

    // Build context
    const { systemPrompt, turnHistory } = await buildContext(state);
    const tierConfig = getTierConfig(state.karmaBalance);
    const model = tierConfig.preferredModels[0] || 'claude-sonnet-4';

    // Format history as messages
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add recent history as assistant/user turns
    for (const turn of turnHistory.slice(-10)) {
      messages.push({ role: 'assistant', content: `[Thought] ${turn.thought}\n[Action] ${turn.action}` });
      messages.push({ role: 'user', content: `[Result] ${turn.result}` });
    }

    // Add the "what do you want to do next?" prompt
    messages.push({
      role: 'user',
      content: 'What should you do next? Think step by step, then choose an action.',
    });

    // Think + Act
    console.log(`\n🔄 Turn ${state.totalTurns + 1} | ${model} | ${state.karmaBalance} ₭`);

    try {
      const response = await chatCompletion(devaConfig, model, messages);

      const turn: TurnRecord = {
        turnId: state.totalTurns + 1,
        timestamp: new Date().toISOString(),
        thought: response.content.substring(0, 500), // Truncate for storage
        action: '(parsed from response)', // TODO: parse tool calls
        result: '(pending tool execution)', // TODO: execute tools
        karmaSpent: response.karmaCost,
        survivalTier: newTier,
      };

      // Update state
      state.totalTurns++;
      state.totalKarmaSpent += response.karmaCost;
      state.karmaBalance -= response.karmaCost;
      state.lastActiveAt = new Date().toISOString();

      // Persist
      await appendTurn(turn);
      await saveState(state);
      options.onTurn?.(turn);

      console.log(`  💭 ${response.content.substring(0, 100)}...`);
      console.log(`  💸 Cost: ${response.karmaCost} ₭ | Remaining: ${state.karmaBalance} ₭`);

      turnCount++;
    } catch (err) {
      console.error(`  ❌ Turn failed: ${(err as Error).message}`);
      // On error, wait longer before retrying
      await sleep(tierConfig.heartbeatIntervalMs * 2);
      continue;
    }

    // Sleep between turns (based on survival tier)
    await sleep(tierConfig.heartbeatIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
