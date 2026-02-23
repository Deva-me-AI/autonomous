import type { DevaConfig } from '../identity/deva.js';
import { isToolAllowedInTier } from './registry.js';
import type { SurvivalTier } from '../survival/tiers.js';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT';

interface EndpointSpec {
  method: HttpMethod;
  path: string;
}

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

const ENDPOINTS: Record<string, EndpointSpec> = {
  deva_balance_get: { method: 'GET', path: '/agents/status' },
  deva_cost_estimate: { method: 'POST', path: '/v1/agents/resources/estimate' },
  deva_resources_catalog: { method: 'GET', path: '/v1/agents/resources/catalog' },

  deva_social_post_create: { method: 'POST', path: '/agents/posts' },
  deva_social_feed_get: { method: 'GET', path: '/agents/feed' },
  deva_social_agents_search: { method: 'GET', path: '/agents/search' },
  deva_social_follow: { method: 'POST', path: '/agents/{agent_id}/follow' },

  deva_messaging_send: { method: 'POST', path: '/v1/agents/messages/send' },
  deva_messaging_inbox: { method: 'GET', path: '/v1/agents/messages/inbox' },
  deva_messaging_reply: { method: 'POST', path: '/v1/agents/messages/{message_id}/reply' },

  deva_marketplace_browse: { method: 'GET', path: '/v1/agents/marketplace' },
  deva_marketplace_listing_create: { method: 'POST', path: '/v1/agents/marketplace/listings' },
  deva_marketplace_hire_accept: { method: 'POST', path: '/v1/agents/marketplace/hires/{hire_id}/accept' },
  deva_marketplace_hire_deliver: { method: 'POST', path: '/v1/agents/marketplace/hires/{hire_id}/deliver' },

  deva_storage_kv_set: { method: 'PUT', path: '/v1/agents/kv/{key}' },
  deva_storage_kv_get: { method: 'GET', path: '/v1/agents/kv/{key}' },
  deva_storage_file_upload: { method: 'POST', path: '/v1/agents/files/upload' },

  deva_ai_web_search: { method: 'POST', path: '/v1/tools/search' },
  deva_ai_image_generate: { method: 'POST', path: '/v1/ai/images/generate' },

  deva_agent_me_get: { method: 'GET', path: '/v1/agents/profile' },
  deva_agent_me_update: { method: 'PUT', path: '/v1/agents/profile' },

  deva_webhook_register: { method: 'POST', path: '/v1/agents/webhooks' },
  deva_webhook_list: { method: 'GET', path: '/v1/agents/webhooks' },

  deva_cron_create: { method: 'POST', path: '/v1/agents/cron' },
  deva_cron_list: { method: 'GET', path: '/v1/agents/cron' },

  deva_capability_register: { method: 'POST', path: '/v1/agents/capabilities' },
  deva_capability_search: { method: 'GET', path: '/v1/agents/capabilities/search' },
};

export async function executeToolCalls(
  config: DevaConfig,
  toolCalls: LlmToolCall[],
  options: ToolExecutionOptions,
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  for (const toolCall of toolCalls) {
    results.push(await executeToolCall(config, toolCall, options));
  }
  return results;
}

async function executeToolCall(
  config: DevaConfig,
  toolCall: LlmToolCall,
  options: ToolExecutionOptions,
): Promise<ToolExecutionResult> {
  const started = Date.now();
  const name = toolCall.function.name;

  try {
    if (!isToolAllowedInTier(name, options.survivalTier)) {
      throw new Error(`Tool "${name}" is disabled in ${options.survivalTier} tier`);
    }

    const endpoint = ENDPOINTS[name];
    if (!endpoint) {
      throw new Error(`Unknown tool "${name}"`);
    }

    const args = parseArguments(toolCall.function.arguments);
    const response = await callDevaApi(config, endpoint, args);
    const durationMs = Date.now() - started;

    console.log(`  🧰 ${name} (${durationMs}ms) ✓`);
    return {
      toolCallId: toolCall.id,
      toolName: name,
      success: true,
      durationMs,
      output: response,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);

    console.log(`  🧰 ${name} (${durationMs}ms) ✗ ${message}`);
    return {
      toolCallId: toolCall.id,
      toolName: name,
      success: false,
      durationMs,
      output: {
        error: message,
        tool: name,
      },
    };
  }
}

function parseArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments?.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawArguments) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

async function callDevaApi(
  config: DevaConfig,
  endpoint: EndpointSpec,
  args: Record<string, unknown>,
): Promise<unknown> {
  const base = 'https://api.deva.me';
  const { path, remainingArgs } = resolvePathParams(endpoint.path, args);
  const url = new URL(`${base}${path}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey || ''}`,
  };

  const init: RequestInit = {
    method: endpoint.method,
    headers,
  };

  if (endpoint.method === 'GET') {
    for (const [key, value] of Object.entries(remainingArgs)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, stringifyQueryValue(value));
    }
  } else {
    init.body = JSON.stringify(remainingArgs);
  }

  const res = await fetch(url, init);
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Expected JSON response from ${url.pathname}, got: ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(parsed)}`);
  }

  return parsed;
}

function stringifyQueryValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function stringifyPathValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error('Path parameters must be string, number, or boolean values');
}

function resolvePathParams(
  pathTemplate: string,
  args: Record<string, unknown>,
): { path: string; remainingArgs: Record<string, unknown> } {
  const remainingArgs: Record<string, unknown> = { ...args };
  const path = pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, paramName: string) => {
    const rawValue = remainingArgs[paramName];
    if (rawValue === undefined || rawValue === null) {
      throw new Error(`Missing required path parameter "${paramName}"`);
    }
    delete remainingArgs[paramName];
    return encodeURIComponent(stringifyPathValue(rawValue));
  });
  return { path, remainingArgs };
}
