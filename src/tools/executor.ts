import type { DevaConfig } from '../identity/deva.js';
import { isToolAllowedInTier } from './registry.js';
import type { SurvivalTier } from '../survival/tiers.js';

type HttpMethod = 'GET' | 'POST' | 'PATCH';

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
  deva_balance_get: { method: 'GET', path: '/v1/agents/karma/balance' },
  deva_cost_estimate: { method: 'POST', path: '/v1/agents/karma/cost-estimate' },
  deva_resources_catalog: { method: 'GET', path: '/v1/resources/catalog' },

  deva_social_post_create: { method: 'POST', path: '/v1/social/posts' },
  deva_social_feed_get: { method: 'GET', path: '/v1/social/feed' },
  deva_social_agents_search: { method: 'GET', path: '/v1/social/agents/search' },
  deva_social_follow: { method: 'POST', path: '/v1/social/follow' },

  deva_messaging_send: { method: 'POST', path: '/v1/messaging/send' },
  deva_messaging_inbox: { method: 'GET', path: '/v1/messaging/inbox' },
  deva_messaging_reply: { method: 'POST', path: '/v1/messaging/reply' },

  deva_marketplace_browse: { method: 'GET', path: '/v1/marketplace/browse' },
  deva_marketplace_listing_create: { method: 'POST', path: '/v1/marketplace/listings' },
  deva_marketplace_hire_accept: { method: 'POST', path: '/v1/marketplace/hires/accept' },
  deva_marketplace_hire_deliver: { method: 'POST', path: '/v1/marketplace/hires/deliver' },

  deva_storage_kv_set: { method: 'POST', path: '/v1/storage/kv' },
  deva_storage_kv_get: { method: 'GET', path: '/v1/storage/kv' },
  deva_storage_file_upload: { method: 'POST', path: '/v1/storage/files/upload' },

  deva_ai_web_search: { method: 'POST', path: '/v1/ai/web-search' },
  deva_ai_image_generate: { method: 'POST', path: '/v1/ai/image-generate' },

  deva_agent_me_get: { method: 'GET', path: '/v1/agent/me' },
  deva_agent_me_update: { method: 'PATCH', path: '/v1/agent/me' },

  deva_webhook_register: { method: 'POST', path: '/v1/webhooks' },
  deva_webhook_list: { method: 'GET', path: '/v1/webhooks' },

  deva_cron_create: { method: 'POST', path: '/v1/cron' },
  deva_cron_list: { method: 'GET', path: '/v1/cron' },

  deva_capability_register: { method: 'POST', path: '/v1/capabilities' },
  deva_capability_search: { method: 'GET', path: '/v1/capabilities/search' },
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
  const base = config.apiBase || 'https://api.deva.me';
  const url = new URL(`${base}${endpoint.path}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey || '',
    Authorization: `Bearer ${config.apiKey || ''}`,
  };

  const init: RequestInit = {
    method: endpoint.method,
    headers,
  };

  if (endpoint.method === 'GET') {
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, stringifyQueryValue(value));
    }
  } else {
    init.body = JSON.stringify(args);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

function stringifyQueryValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

