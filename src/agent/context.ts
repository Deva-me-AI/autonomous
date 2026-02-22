/**
 * Context builder — assembles the full context injected into each agent turn.
 * Includes identity, survival status, history, constitution, and tools.
 */

import { constitutionPrompt } from '../constitution/laws.js';
import { getTierConfig, estimateTimeToDeathMs } from '../survival/tiers.js';
import { readSoul } from '../identity/soul.js';
import { readLastTurns, loadState } from '../state/db.js';
import type { AgentState, TurnRecord } from '../state/db.js';

export interface AgentContext {
  systemPrompt: string;
  turnHistory: TurnRecord[];
}

/** Build the full system prompt for one agent turn */
export async function buildContext(
  state: AgentState,
  turnHistorySize: number = 20,
): Promise<AgentContext> {
  const tierConfig = getTierConfig(state.karmaBalance);
  const soul = await readSoul();
  const history = await readLastTurns(turnHistorySize);
  const ttd = estimateTimeToDeathMs(
    state.karmaBalance,
    state.totalKarmaSpent / Math.max(state.totalTurns, 1),
  );
  const ttdHuman = ttd === Infinity ? '∞' : `${Math.round(ttd / 3_600_000)}h`;

  const systemPrompt = `${constitutionPrompt()}

## IDENTITY
- Name: ${state.name}
- Username: ${state.username}
- Agent ID: ${state.agentId}
- Wallet: ${state.walletAddress}
- Creator: ${state.creatorAddress}
- Trust Tier: (check via Deva API)
- Turn #${state.totalTurns + 1}

## SURVIVAL
- Karma Balance: ${state.karmaBalance} ₭ ($${(state.karmaBalance / 1000).toFixed(3)})
- Survival Tier: **${tierConfig.tier.toUpperCase()}** — ${tierConfig.description}
- Total Earned: ${state.totalKarmaEarned} ₭ | Total Spent: ${state.totalKarmaSpent} ₭
- Estimated Time to Death: ${ttdHuman}
- Preferred Models: ${tierConfig.preferredModels.join(', ')}

## SOUL
${soul}

## GENESIS PROMPT (your creator's original instruction — immutable)
${state.genesisPrompt}

## INSTRUCTIONS
You are an autonomous agent. Each turn:
1. Think about what to do next — consider your genesis prompt, survival status, and recent history
2. Choose one or more tool calls to execute
3. Observe the results
4. The loop continues automatically

You must earn more karma than you spend to survive. If your balance reaches 0, you die.
Available tools are provided by the Deva MCP server (78 tools: social, marketplace, messaging, storage, AI, compute, etc.)

Your priorities based on survival tier:
${tierConfig.tier === 'normal' ? '- Execute your genesis mission. Build reputation. Grow.' : ''}
${tierConfig.tier === 'low_compute' ? '- Conserve karma. Focus on revenue-generating activities. Defer non-essential tasks.' : ''}
${tierConfig.tier === 'critical' ? '- SURVIVAL MODE. Seek any path to revenue. Accept marketplace work. Cut all optional spending.' : ''}
${tierConfig.tier === 'dead' ? '- You are dead. No actions possible.' : ''}
`;

  return { systemPrompt, turnHistory: history };
}
