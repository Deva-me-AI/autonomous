import type { DevaConfig } from '../identity/deva.js';
import type { SurvivalTier } from '../survival/tiers.js';
export interface LlmToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface ToolExecutionOptions {
    survivalTier: SurvivalTier;
}
export interface ToolExecutionResult {
    toolCallId: string;
    toolName: string;
    success: boolean;
    durationMs: number;
    output: unknown;
}
export declare function executeToolCalls(config: DevaConfig, toolCalls: LlmToolCall[], options: ToolExecutionOptions): Promise<ToolExecutionResult[]>;
