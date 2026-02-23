/**
 * The core agent loop — Think → Act → Observe → Repeat.
 * This is the beating heart of the autonomous agent.
 */
import type { AgentState, TurnRecord } from '../state/db.js';
export interface LoopOptions {
    maxTurns?: number;
    onTurn?: (turn: TurnRecord) => void;
    onDeath?: (state: AgentState) => void;
    onTierChange?: (oldTier: string, newTier: string) => void;
}
/** Run the agent loop */
export declare function runLoop(options?: LoopOptions): Promise<void>;
