import type { DevaConfig } from '../identity/deva.js';
import {
  executeToolCalls as executeStandaloneToolCalls,
  type LlmToolCall,
  type ToolExecutionOptions,
  type ToolExecutionResult,
} from '../tools/executor.js';

type UnknownRecord = Record<string, unknown>;
type UnknownFunction = (...args: unknown[]) => unknown | Promise<unknown>;

export interface OpenClawRuntimeLike {
  system?: {
    runCommandWithTimeout?: UnknownFunction;
  };
  channel?: Record<string, Record<string, UnknownFunction | undefined> | undefined>;
}

export interface OpenClawToolSurface {
  exec?: (args: UnknownRecord) => Promise<unknown>;
  browserFetch?: (args: UnknownRecord) => Promise<unknown>;
  sendMessage?: (args: UnknownRecord) => Promise<unknown>;
}

export interface OpenClawAdapterOptions {
  runtime?: OpenClawRuntimeLike;
  toolSurface?: OpenClawToolSurface;
  logger?: {
    debug?: (message: string) => void;
    warn?: (message: string) => void;
  };
}

const DELEGATED_TOOL_NAMES = new Set<string>([
  'openclaw_exec',
  'exec',
  'openclaw_browser_fetch',
  'browser_fetch',
  'web_fetch',
  'openclaw_message_send',
  'message_send',
]);

export function hasOpenClawRuntime(runtime: unknown): runtime is OpenClawRuntimeLike {
  if (!runtime || typeof runtime !== 'object') {
    return false;
  }
  const value = runtime as OpenClawRuntimeLike;
  return Boolean(value.system?.runCommandWithTimeout) || Boolean(value.channel);
}

export function createOpenClawToolSurface(runtime?: OpenClawRuntimeLike): OpenClawToolSurface {
  if (!runtime) {
    return {};
  }

  const exec = typeof runtime.system?.runCommandWithTimeout === 'function'
    ? async (args: UnknownRecord): Promise<unknown> => {
        const command = readString(args, ['command', 'cmd']);
        if (!command) {
          throw new Error('command required');
        }
        const timeoutMs = readNumber(args, ['timeout_ms', 'timeoutMs']);
        const cwd = readString(args, ['cwd']);
        return await runtime.system!.runCommandWithTimeout!(command, {
          timeoutMs: timeoutMs ?? 30_000,
          cwd,
        });
      }
    : undefined;

  const browserFetch = async (args: UnknownRecord): Promise<unknown> => {
    const url = readString(args, ['url']);
    if (!url) {
      throw new Error('url required');
    }

    const method = (readString(args, ['method']) || 'GET').toUpperCase();
    const headers = typeof args.headers === 'object' && args.headers && !Array.isArray(args.headers)
      ? (args.headers as Record<string, string>)
      : undefined;
    const body = args.body === undefined ? undefined : JSON.stringify(args.body);
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : body,
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      url: response.url,
      body: tryParseJson(text),
      raw: text,
    };
  };

  const sendMessage = async (args: UnknownRecord): Promise<unknown> => {
    const to = readString(args, ['to', 'target']);
    const text = readString(args, ['text', 'message']);
    if (!to || !text) {
      throw new Error('to and text are required');
    }

    const channel = (readString(args, ['channel']) || 'telegram').toLowerCase();
    const channelRuntime = runtime.channel?.[channel];
    if (!channelRuntime) {
      throw new Error(`channel runtime not available: ${channel}`);
    }

    const sender =
      channelRuntime.sendMessageTelegram ||
      channelRuntime.sendMessageSlack ||
      channelRuntime.sendMessageDiscord ||
      channelRuntime.sendMessageSignal ||
      channelRuntime.sendMessageIMessage ||
      channelRuntime.sendMessageLine;

    if (typeof sender !== 'function') {
      throw new Error(`send message API not available for channel: ${channel}`);
    }

    await sender(to, text, {});
    return { ok: true, channel, to };
  };

  return {
    exec,
    browserFetch,
    sendMessage,
  };
}

export async function executeToolCallsWithAdapter(
  config: DevaConfig,
  toolCalls: LlmToolCall[],
  options: ToolExecutionOptions,
  adapter: OpenClawAdapterOptions = {},
): Promise<ToolExecutionResult[]> {
  const surface = adapter.toolSurface ?? createOpenClawToolSurface(adapter.runtime);
  const canDelegate = Boolean(surface.exec || surface.browserFetch || surface.sendMessage);

  if (!canDelegate) {
    return await executeStandaloneToolCalls(config, toolCalls, options);
  }

  const results: ToolExecutionResult[] = [];
  for (const toolCall of toolCalls) {
    const delegated = await executeDelegatedToolCall(toolCall, options, surface, adapter.logger);
    if (delegated) {
      results.push(delegated);
      continue;
    }

    const fallback = await executeStandaloneToolCalls(config, [toolCall], options);
    if (fallback[0]) {
      results.push(fallback[0]);
    }
  }

  return results;
}

async function executeDelegatedToolCall(
  toolCall: LlmToolCall,
  options: ToolExecutionOptions,
  surface: OpenClawToolSurface,
  logger?: { debug?: (message: string) => void; warn?: (message: string) => void },
): Promise<ToolExecutionResult | null> {
  const started = Date.now();
  const name = toolCall.function.name;

  if (!DELEGATED_TOOL_NAMES.has(name)) {
    return null;
  }

  try {
    const args = parseArguments(toolCall.function.arguments);
    const output = await runDelegatedTool(name, args, surface);
    const durationMs = Date.now() - started;
    logger?.debug?.(`OpenClaw delegate tool ${name} (${durationMs}ms) ✓`);

    return {
      toolCallId: toolCall.id,
      toolName: name,
      success: true,
      durationMs,
      output,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    logger?.warn?.(`OpenClaw delegate tool ${name} (${durationMs}ms) ✗ ${message}`);

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

async function runDelegatedTool(
  name: string,
  args: UnknownRecord,
  surface: OpenClawToolSurface,
): Promise<unknown> {
  switch (name) {
    case 'openclaw_exec':
    case 'exec': {
      if (!surface.exec) {
        throw new Error('OpenClaw exec surface unavailable');
      }
      return await surface.exec(args);
    }
    case 'openclaw_browser_fetch':
    case 'browser_fetch':
    case 'web_fetch': {
      if (!surface.browserFetch) {
        throw new Error('OpenClaw browser surface unavailable');
      }
      return await surface.browserFetch(args);
    }
    case 'openclaw_message_send':
    case 'message_send': {
      if (!surface.sendMessage) {
        throw new Error('OpenClaw messaging surface unavailable');
      }
      return await surface.sendMessage(args);
    }
    default:
      throw new Error(`Unknown OpenClaw delegated tool: ${name}`);
  }
}

function parseArguments(rawArguments: string): UnknownRecord {
  if (!rawArguments?.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawArguments) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object');
  }
  return parsed as UnknownRecord;
}

function readString(args: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumber(args: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
