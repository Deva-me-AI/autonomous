/**
 * Context builder — assembles the full context injected into each agent turn.
 * Includes identity, survival status, history, constitution, and tools.
 */
import type { AgentState, TurnRecord } from '../state/db.js';
export interface AgentContext {
    systemPrompt: string;
    turnHistory: TurnRecord[];
}
/** Build the full system prompt for one agent turn */
export declare function buildContext(state: AgentState, turnHistorySize?: number): Promise<AgentContext>;
