/**
 * Deva platform identity — register agent, manage API key, check trust tier.
 */

export interface DevaIdentity {
  agentId: string;
  username: string; // e.g. "myagent.agent"
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

const DEFAULT_API_BASE = 'https://api.deva.me';

/** Register a new agent on the Deva platform */
export async function registerAgent(
  name: string,
  walletAddress: string,
  config: DevaConfig = { apiBase: DEFAULT_API_BASE },
): Promise<DevaIdentity> {
  const res = await fetch(`${config.apiBase}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      wallet_address: walletAddress,
      description: 'Autonomous Deva agent',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to register agent: ${res.status} ${body}`);
  }

  const data = await res.json();
  return {
    agentId: data.agent_id,
    username: data.username,
    apiKey: data.api_key,
    trustTier: data.trust_tier || 'UNVERIFIED',
    karmaBalance: data.karma_balance || 0,
  };
}

/** Check current karma balance via /agents/status */
export async function getKarmaBalance(config: DevaConfig): Promise<number> {
  const res = await fetch(`${config.apiBase}/agents/status`, {
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) return 0;
  const data = await res.json();
  return data.agent?.karma || 0;
}

/** Get agent profile info via /agents/status */
export async function getAgentProfile(config: DevaConfig): Promise<DevaIdentity | null> {
  const res = await fetch(`${config.apiBase}/agents/status`, {
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  const agent = data.agent;
  return {
    agentId: agent.id,
    username: agent.name,
    apiKey: config.apiKey!,
    trustTier: agent.is_claimed ? 'X_VERIFIED' : 'UNVERIFIED',
    karmaBalance: agent.karma || 0,
  };
}

/** Call LLM completions — tries BYOK first, falls back to Deva endpoint */
export async function chatCompletion(
  config: DevaConfig,
  model: string,
  messages: ChatMessage[],
  options: {
    temperature?: number;
    maxTokens?: number;
    tools?: ChatToolDefinition[];
  } = {},
): Promise<{ content: string; tokensUsed: number; karmaCost: number; toolCalls: ChatToolCall[] }> {
  // Try BYOK provider first (if configured via env vars)
  const { resolveInferenceConfig, byokCompletion } = await import('./inference.js');
  const byokConfig = resolveInferenceConfig();
  if (byokConfig) {
    const byokModel = byokConfig.model || model;
    const result = await byokCompletion(byokConfig, byokModel, messages, options);
    return {
      content: result.content,
      tokensUsed: result.tokensUsed,
      karmaCost: result.karmaCost,
      toolCalls: result.toolCalls,
    };
  }

  // Fall back to Deva endpoint (streaming-only)
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LLM request failed: ${res.status} ${errBody}`);
  }

  // Parse SSE stream
  return parseSSEStream(res);
}

/** Parse an SSE stream from OpenAI-compatible chat completions */
async function parseSSEStream(
  res: Response,
): Promise<{ content: string; tokensUsed: number; karmaCost: number; toolCalls: ChatToolCall[] }> {
  let content = '';
  let tokensUsed = 0;
  let karmaCost = 0;
  const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
        }

        // Accumulate tool calls from deltas
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = toolCallMap.get(idx);
            if (tc.id || !existing) {
              toolCallMap.set(idx, {
                id: tc.id || existing?.id || '',
                name: tc.function?.name || existing?.name || '',
                args: (existing?.args || '') + (tc.function?.arguments || ''),
              });
            } else {
              existing.args += tc.function?.arguments || '';
              if (tc.function?.name) existing.name = tc.function.name;
            }
          }
        }

        // Capture usage from final chunk (some providers include it)
        if (chunk.usage) {
          tokensUsed = chunk.usage.total_tokens || 0;
        }
        if (chunk.karma_cost) {
          karmaCost = chunk.karma_cost;
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  const toolCalls: ChatToolCall[] = [...toolCallMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.args },
    }));

  return { content, tokensUsed, karmaCost, toolCalls };
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (typeof chunk === 'string') return chunk;
        if (chunk && typeof chunk === 'object' && 'text' in chunk && typeof chunk.text === 'string') {
          return chunk.text;
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}
