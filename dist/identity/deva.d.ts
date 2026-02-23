/**
 * Deva platform identity — register agent, manage API key, check trust tier.
 */
export interface DevaIdentity {
    agentId: string;
    username: string;
    apiKey: string;
    trustTier: 'UNVERIFIED' | 'X_VERIFIED' | 'GENIE_VERIFIED';
    karmaBalance: number;
}
export interface DevaConfig {
    apiBase: string;
    apiKey?: string;
    agentId?: string;
}
export interface ChatToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    tool_call_id?: string;
    tool_calls?: ChatToolCall[];
}
export interface ChatToolDefinition {
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
/** Register a new agent on the Deva platform */
export declare function registerAgent(name: string, walletAddress: string, config?: DevaConfig): Promise<DevaIdentity>;
/** Check current karma balance */
export declare function getKarmaBalance(config: DevaConfig): Promise<number>;
/** Get agent profile info */
export declare function getAgentProfile(config: DevaConfig): Promise<DevaIdentity | null>;
/** Call LLM completions — tries BYOK first, falls back to Deva endpoint */
export declare function chatCompletion(config: DevaConfig, model: string, messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: ChatToolDefinition[];
}): Promise<{
    content: string;
    tokensUsed: number;
    karmaCost: number;
    toolCalls: ChatToolCall[];
}>;
