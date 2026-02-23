/**
 * The core agent loop — Think → Act → Observe → Repeat.
 * This is the beating heart of the autonomous agent.
 */
import { buildContext } from './context.js';
import { chatCompletion, getKarmaBalance } from '../identity/deva.js';
import { getTier, getTierConfig } from '../survival/tiers.js';
import { loadState, saveState, appendTurn } from '../state/db.js';
import { appendJournalEntry } from '../identity/soul.js';
import { executeToolCalls } from '../tools/executor.js';
import { getToolsForTier } from '../tools/registry.js';
/** Run the agent loop */
export async function runLoop(options = {}) {
    const state = await loadState();
    if (!state) {
        throw new Error('Agent not initialized. Run setup first.');
    }
    if (state.paused) {
        console.log('⏸️  Agent is paused. Use `deva-autonomous resume` to continue.');
        return;
    }
    const devaConfig = {
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
        // Refresh karma balance from Deva (skip in BYOK mode — use local balance)
        const oldTier = getTier(state.karmaBalance);
        const { resolveInferenceConfig } = await import('../identity/inference.js');
        const isByok = resolveInferenceConfig() !== null;
        if (!isByok) {
            state.karmaBalance = await getKarmaBalance(devaConfig);
        }
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
        const messages = [
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
            const step = await runThoughtAndAction(devaConfig, model, messages, newTier);
            const turn = {
                turnId: state.totalTurns + 1,
                timestamp: new Date().toISOString(),
                thought: step.finalContent.substring(0, 500),
                action: step.actionSummary,
                result: step.resultSummary,
                karmaSpent: step.karmaCost,
                survivalTier: newTier,
            };
            // Update state
            state.totalTurns++;
            state.totalKarmaSpent += step.karmaCost;
            state.karmaBalance -= step.karmaCost;
            state.lastActiveAt = new Date().toISOString();
            // Persist
            await appendTurn(turn);
            await saveState(state);
            options.onTurn?.(turn);
            console.log(`  💭 ${step.finalContent.substring(0, 100)}...`);
            console.log(`  🧰 Tools: ${step.toolExecutions}`);
            console.log(`  💸 Cost: ${step.karmaCost} ₭ | Remaining: ${state.karmaBalance} ₭`);
            turnCount++;
        }
        catch (err) {
            console.error(`  ❌ Turn failed: ${err.message}`);
            // On error, wait longer before retrying
            await sleep(tierConfig.heartbeatIntervalMs * 2);
            continue;
        }
        // Sleep between turns (based on survival tier)
        await sleep(tierConfig.heartbeatIntervalMs);
    }
}
async function runThoughtAndAction(devaConfig, model, messages, survivalTier) {
    const MAX_TOOL_ROUNDS = 6;
    const tools = getToolsForTier(survivalTier);
    let karmaCost = 0;
    let finalContent = '';
    let actionSummary = 'no tool calls';
    let resultSummary = 'no tool calls';
    let toolExecutions = 0;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await chatCompletion(devaConfig, model, messages, { tools });
        karmaCost += response.karmaCost;
        finalContent = response.content || finalContent;
        const toolCalls = response.toolCalls ?? [];
        if (toolCalls.length === 0) {
            return {
                finalContent: finalContent || '(no content)',
                actionSummary,
                resultSummary,
                karmaCost,
                toolExecutions,
            };
        }
        actionSummary = toolCalls.map((t) => t.function.name).join(', ');
        messages.push({
            role: 'assistant',
            content: response.content || 'Executing requested tools.',
            tool_calls: toolCalls,
        });
        const toolResults = await executeToolCalls(devaConfig, toolCalls, { survivalTier });
        toolExecutions += toolResults.length;
        resultSummary = summarizeToolResults(toolResults);
        for (const result of toolResults) {
            messages.push({
                role: 'tool',
                tool_call_id: result.toolCallId,
                content: JSON.stringify({
                    success: result.success,
                    duration_ms: result.durationMs,
                    output: result.output,
                }),
            });
        }
    }
    return {
        finalContent: finalContent || '(max tool rounds reached)',
        actionSummary,
        resultSummary: `${resultSummary}; max tool rounds reached`,
        karmaCost,
        toolExecutions,
    };
}
function summarizeToolResults(results) {
    return results
        .map((r) => {
        if (r.success) {
            return `${r.toolName}: ok`;
        }
        const err = r.output &&
            typeof r.output === 'object' &&
            'error' in r.output &&
            typeof r.output.error === 'string'
            ? r.output.error
            : 'failed';
        return `${r.toolName}: ${err}`;
    })
        .join(' | ')
        .slice(0, 500);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
