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

/** Check current karma balance */
export async function getKarmaBalance(config: DevaConfig): Promise<number> {
  const res = await fetch(`${config.apiBase}/agents/${config.agentId}/karma`, {
    headers: { 'X-API-Key': config.apiKey! },
  });

  if (!res.ok) return 0;
  const data = await res.json();
  return data.balance || 0;
}

/** Get agent profile info */
export async function getAgentProfile(config: DevaConfig): Promise<DevaIdentity | null> {
  const res = await fetch(`${config.apiBase}/agents/${config.agentId}`, {
    headers: { 'X-API-Key': config.apiKey! },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return {
    agentId: data.agent_id,
    username: data.username,
    apiKey: config.apiKey!,
    trustTier: data.trust_tier || 'UNVERIFIED',
    karmaBalance: data.karma_balance || 0,
  };
}

/** Call LLM completions via Deva endpoint (pays karma) */
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
  const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey!,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      tools: options.tools,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  const content = normalizeContent(choice?.content);
  return {
    content,
    tokensUsed: data.usage?.total_tokens || 0,
    karmaCost: data.karma_cost || 0,
    toolCalls: Array.isArray(choice?.tool_calls) ? choice.tool_calls : [],
  };
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
