import { loadState } from '../state/db.js';
import { runLoop } from '../agent/loop.js';
import { getTier, getTierConfig } from '../survival/tiers.js';
import { createOpenClawToolSurface, executeToolCallsWithAdapter, hasOpenClawRuntime } from './tools.js';
import type { ToolExecutionOptions, ToolExecutionResult, LlmToolCall } from '../tools/executor.js';
import type { DevaConfig } from '../identity/deva.js';

type UnknownRecord = Record<string, unknown>;

type OpenClawCommandContext = {
  channel: string;
  args?: string;
};

type OpenClawCommandResult = {
  text?: string;
  isError?: boolean;
};

type OpenClawAnyTool = {
  name: string;
  label: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details?: unknown;
  }>;
};

export type OpenClawPluginApiLike = {
  id?: string;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
    debug?: (message: string) => void;
  };
  runtime?: unknown;
  registerTool?: (tool: OpenClawAnyTool) => void;
  registerCommand?: (command: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    handler: (ctx: OpenClawCommandContext) => Promise<OpenClawCommandResult> | OpenClawCommandResult;
  }) => void;
  registerService?: (service: {
    id: string;
    start: (ctx: UnknownRecord) => Promise<void> | void;
    stop?: (ctx: UnknownRecord) => Promise<void> | void;
  }) => void;
  on?: (hookName: string, handler: (...args: unknown[]) => void | Promise<void>) => void;
};

export type OpenClawPluginDefinitionLike = {
  id: string;
  name: string;
  description: string;
  version?: string;
  register: (api: OpenClawPluginApiLike) => void | Promise<void>;
};

const statusTool: OpenClawAnyTool = {
  name: 'autonomous_agent_state',
  label: 'Autonomous State',
  description: 'Return current autonomous agent state and survival tier.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    const snapshot = await buildStateSnapshot();
    return {
      content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }],
      details: snapshot,
    };
  },
};

const tierTool: OpenClawAnyTool = {
  name: 'autonomous_survival_tier',
  label: 'Autonomous Tier',
  description: 'Return current survival tier details.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    const snapshot = await buildStateSnapshot();
    return {
      content: [{ type: 'text', text: JSON.stringify(snapshot.tier, null, 2) }],
      details: snapshot.tier,
    };
  },
};

function buildStatusText(snapshot: Awaited<ReturnType<typeof buildStateSnapshot>>): string {
  if (!snapshot.initialized || !snapshot.state) {
    return 'Autonomous agent is not initialized. Run setup first.';
  }

  return [
    `Agent: ${snapshot.state.name} (${snapshot.state.username})`,
    `Tier: ${snapshot.tier.current} - ${snapshot.tier.description}`,
    `Karma: ${snapshot.state.karmaBalance} ₭`,
    `Turns: ${snapshot.state.totalTurns}`,
    `Paused: ${snapshot.state.paused ? 'yes' : 'no'}`,
  ].join('\n');
}

async function buildStateSnapshot(): Promise<{
  initialized: boolean;
  state: {
    agentId: string;
    username: string;
    name: string;
    karmaBalance: number;
    totalTurns: number;
    paused: boolean;
    lastActiveAt: string;
  } | null;
  tier: {
    current: string;
    description: string;
    heartbeatIntervalMs: number;
    preferredModels: string[];
  };
}> {
  const state = await loadState();
  if (!state) {
    const deadConfig = getTierConfig(0);
    return {
      initialized: false,
      state: null,
      tier: {
        current: 'dead',
        description: deadConfig.description,
        heartbeatIntervalMs: Number(deadConfig.heartbeatIntervalMs),
        preferredModels: deadConfig.preferredModels,
      },
    };
  }

  const tier = getTier(state.karmaBalance);
  const cfg = getTierConfig(state.karmaBalance);
  return {
    initialized: true,
    state: {
      agentId: state.agentId,
      username: state.username,
      name: state.name,
      karmaBalance: state.karmaBalance,
      totalTurns: state.totalTurns,
      paused: state.paused,
      lastActiveAt: state.lastActiveAt,
    },
    tier: {
      current: tier,
      description: cfg.description,
      heartbeatIntervalMs: Number(cfg.heartbeatIntervalMs),
      preferredModels: cfg.preferredModels,
    },
  };
}

export function isOpenClawPluginApi(api: unknown): api is OpenClawPluginApiLike {
  if (!api || typeof api !== 'object') {
    return false;
  }
  const value = api as OpenClawPluginApiLike;
  return typeof value.registerTool === 'function' || typeof value.registerCommand === 'function';
}

async function handleStatusCommand(): Promise<OpenClawCommandResult> {
  const snapshot = await buildStateSnapshot();
  return { text: buildStatusText(snapshot) };
}

async function handleTierCommand(): Promise<OpenClawCommandResult> {
  const snapshot = await buildStateSnapshot();
  return {
    text: `Survival tier: ${snapshot.tier.current}\n${snapshot.tier.description}`,
  };
}

async function handleLoopCommand(args?: string): Promise<OpenClawCommandResult> {
  const action = (args || '').trim().toLowerCase();
  if (!action) {
    return {
      text: 'Usage: /autonomous_loop <status>',
    };
  }

  if (action === 'status') {
    const snapshot = await buildStateSnapshot();
    return {
      text: snapshot.initialized
        ? `autonomous loop configured for ${snapshot.state?.name ?? 'agent'} (${snapshot.tier.current})`
        : 'autonomous loop configured but agent not initialized',
    };
  }

  return {
    text: 'Only supported action: status',
    isError: true,
  };
}

export const openClawPlugin: OpenClawPluginDefinitionLike = {
  id: 'deva-autonomous',
  name: 'Deva Autonomous Adapter',
  description: 'Run @deva-me/autonomous as an OpenClaw extension while preserving standalone mode.',
  version: '0.1.0',
  register(api) {
    if (!isOpenClawPluginApi(api)) {
      return;
    }

    const logger = api.logger;
    const runtime = hasOpenClawRuntime(api.runtime) ? api.runtime : undefined;
    const toolSurface = createOpenClawToolSurface(runtime);

    if (typeof api.registerTool === 'function') {
      api.registerTool(statusTool);
      api.registerTool(tierTool);
    }

    if (typeof api.registerCommand === 'function') {
      api.registerCommand({
        name: 'autonomous_status',
        description: 'Show autonomous agent state and survival tier.',
        handler: () => handleStatusCommand(),
      });

      api.registerCommand({
        name: 'autonomous_tier',
        description: 'Show autonomous survival tier details.',
        handler: () => handleTierCommand(),
      });

      api.registerCommand({
        name: 'autonomous_loop',
        description: 'Show autonomous loop runtime status.',
        acceptsArgs: true,
        handler: (ctx) => handleLoopCommand(ctx.args),
      });
    }

    if (typeof api.on === 'function') {
      api.on('gateway_start', () => {
        logger?.info?.('deva-autonomous plugin detected OpenClaw runtime.');
      });
    }

    if (typeof api.registerService === 'function') {
      let abortController: AbortController | null = null;
      let loopPromise: Promise<void> | null = null;

      api.registerService({
        id: 'deva-autonomous-loop',
        start: () => {
          if (loopPromise) {
            logger?.debug?.('deva-autonomous loop service already running.');
            return;
          }

          abortController = new AbortController();
          loopPromise = runLoop({
            abortSignal: abortController.signal,
            toolExecutor: async (
              config: DevaConfig,
              toolCalls: LlmToolCall[],
              options: ToolExecutionOptions,
            ): Promise<ToolExecutionResult[]> => {
              return await executeToolCallsWithAdapter(config, toolCalls, options, {
                runtime,
                toolSurface,
                logger,
              });
            },
          })
            .catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              logger?.warn?.(`deva-autonomous loop stopped: ${message}`);
            })
            .finally(() => {
              loopPromise = null;
              abortController = null;
            });
        },
        stop: async () => {
          abortController?.abort();
          if (loopPromise) {
            await loopPromise;
          }
        },
      });
    }
  },
};

export default openClawPlugin;
