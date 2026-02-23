import type { SurvivalTier } from '../survival/tiers.js';
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, unknown>;
            required?: string[];
            additionalProperties?: boolean;
        };
    };
}
export declare const ALL_TOOLS: ToolDefinition[];
export declare function getToolsForTier(tier: SurvivalTier): ToolDefinition[];
export declare function isToolAllowedInTier(toolName: string, tier: SurvivalTier): boolean;
