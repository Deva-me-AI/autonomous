/**
 * First-run interactive setup wizard.
 * Generates wallet, registers on Deva, writes initial config.
 */
import type { AgentState } from '../state/db.js';
/** Run the interactive setup wizard */
export declare function runSetup(): Promise<AgentState>;
