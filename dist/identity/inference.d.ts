/**
 * BYOK Inference — route LLM calls to different providers.
 * Supports: Deva (default), OpenAI-compatible, Anthropic, Google.
 *
 * Environment variables:
 *   DEVA_LLM_PROVIDER=deva|openai|anthropic|google  (default: openai)
 *   OPENAI_API_KEY=sk-...       (for OpenAI/OpenRouter)
 *   OPENAI_BASE_URL=https://...  (for OpenRouter or custom endpoint)
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   GOOGLE_API_KEY=...
 */
import type { ChatMessage, ChatToolCall, ChatToolDefinition } from './deva.js';
export interface InferenceConfig {
    provider: 'deva' | 'openai' | 'anthropic' | 'google';
    apiKey: string;
    baseUrl?: string;
    model?: string;
}
export interface InferenceResult {
    content: string;
    toolCalls: ChatToolCall[];
    tokensUsed: number;
    karmaCost: number;
}
/** Resolve inference config from environment */
export declare function resolveInferenceConfig(): InferenceConfig | null;
/** Call OpenAI-compatible API (works for OpenAI, OpenRouter, any compatible endpoint) */
export declare function openaiCompletion(config: InferenceConfig, model: string, messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: ChatToolDefinition[];
}): Promise<InferenceResult>;
/** Call Anthropic Messages API */
export declare function anthropicCompletion(config: InferenceConfig, model: string, messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: ChatToolDefinition[];
}): Promise<InferenceResult>;
/** Unified completion — routes to the right provider */
export declare function byokCompletion(config: InferenceConfig, model: string, messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: ChatToolDefinition[];
}): Promise<InferenceResult>;
