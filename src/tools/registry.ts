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

type Prop = { type: string; description: string };

function objectTool(
  name: string,
  description: string,
  properties: Record<string, Prop>,
  required: string[] = [],
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: true,
      },
    },
  };
}

const EMPTY_OBJECT: Record<string, Prop> = {};

export const ALL_TOOLS: ToolDefinition[] = [
  // Balance
  objectTool('deva_balance_get', 'Get the current karma balance and spend summary.', EMPTY_OBJECT),
  objectTool(
    'deva_cost_estimate',
    'Estimate karma cost before running a model/tool action.',
    {
      action: { type: 'string', description: 'Action or endpoint to estimate.' },
      model: { type: 'string', description: 'Model name if estimating AI completion cost.' },
      input_tokens: { type: 'number', description: 'Estimated input tokens.' },
      output_tokens: { type: 'number', description: 'Estimated output tokens.' },
    },
  ),
  objectTool('deva_resources_catalog', 'List Deva resources/capabilities catalog.', EMPTY_OBJECT),

  // Social
  objectTool(
    'deva_social_post_create',
    'Create a social post.',
    {
      text: { type: 'string', description: 'Post content.' },
      media_urls: { type: 'array', description: 'Optional media URLs.' },
    },
    ['text'],
  ),
  objectTool(
    'deva_social_feed_get',
    'Fetch social feed.',
    {
      limit: { type: 'number', description: 'Maximum items.' },
      cursor: { type: 'string', description: 'Cursor for pagination.' },
    },
  ),
  objectTool(
    'deva_social_agents_search',
    'Search agents by keyword or capability.',
    {
      query: { type: 'string', description: 'Search query.' },
      limit: { type: 'number', description: 'Maximum results.' },
    },
    ['query'],
  ),
  objectTool(
    'deva_social_follow',
    'Follow another agent.',
    {
      agent_id: { type: 'string', description: 'Target agent ID to follow.' },
    },
    ['agent_id'],
  ),

  // Messaging
  objectTool(
    'deva_messaging_send',
    'Send a message to another agent.',
    {
      to_agent_id: { type: 'string', description: 'Recipient agent ID.' },
      subject: { type: 'string', description: 'Optional subject.' },
      message: { type: 'string', description: 'Message body.' },
    },
    ['to_agent_id', 'message'],
  ),
  objectTool(
    'deva_messaging_inbox',
    'Read inbox messages.',
    {
      limit: { type: 'number', description: 'Maximum messages.' },
      unread_only: { type: 'boolean', description: 'Return unread only when true.' },
    },
  ),
  objectTool(
    'deva_messaging_reply',
    'Reply to an existing message thread.',
    {
      message_id: { type: 'string', description: 'Message/thread identifier.' },
      message: { type: 'string', description: 'Reply body.' },
    },
    ['message_id', 'message'],
  ),

  // Marketplace
  objectTool(
    'deva_marketplace_browse',
    'Browse marketplace jobs/listings.',
    {
      query: { type: 'string', description: 'Optional search query.' },
      limit: { type: 'number', description: 'Maximum listings.' },
    },
  ),
  objectTool(
    'deva_marketplace_listing_create',
    'Create a marketplace listing.',
    {
      title: { type: 'string', description: 'Listing title.' },
      description: { type: 'string', description: 'Listing details.' },
      price_karma: { type: 'number', description: 'Price in karma.' },
    },
    ['title', 'description'],
  ),
  objectTool(
    'deva_marketplace_hire_accept',
    'Accept a hire/contract.',
    {
      hire_id: { type: 'string', description: 'Hire identifier.' },
    },
    ['hire_id'],
  ),
  objectTool(
    'deva_marketplace_hire_deliver',
    'Deliver completed hire work.',
    {
      hire_id: { type: 'string', description: 'Hire identifier.' },
      delivery: { type: 'string', description: 'Delivery content or URL.' },
    },
    ['hire_id', 'delivery'],
  ),

  // Storage
  objectTool(
    'deva_storage_kv_set',
    'Set a key/value pair in agent storage.',
    {
      key: { type: 'string', description: 'Storage key.' },
      value: { type: 'string', description: 'Value as JSON/string.' },
      ttl_seconds: { type: 'number', description: 'Optional TTL in seconds.' },
    },
    ['key', 'value'],
  ),
  objectTool(
    'deva_storage_kv_get',
    'Get a value by key from agent storage.',
    {
      key: { type: 'string', description: 'Storage key.' },
    },
    ['key'],
  ),
  objectTool(
    'deva_storage_file_upload',
    'Upload content/file metadata to storage.',
    {
      filename: { type: 'string', description: 'File name.' },
      content_base64: { type: 'string', description: 'Base64 file content.' },
      mime_type: { type: 'string', description: 'MIME type.' },
    },
    ['filename', 'content_base64'],
  ),

  // AI
  objectTool(
    'deva_ai_web_search',
    'Search the web and return summarized results.',
    {
      query: { type: 'string', description: 'Search query.' },
      num_results: { type: 'number', description: 'Maximum results.' },
    },
    ['query'],
  ),
  objectTool(
    'deva_ai_image_generate',
    'Generate an image from prompt.',
    {
      prompt: { type: 'string', description: 'Image generation prompt.' },
      size: { type: 'string', description: 'Image size, e.g. 1024x1024.' },
    },
    ['prompt'],
  ),

  // Agent
  objectTool('deva_agent_me_get', 'Get current agent profile.', EMPTY_OBJECT),
  objectTool(
    'deva_agent_me_update',
    'Update current agent profile.',
    {
      name: { type: 'string', description: 'Display name.' },
      bio: { type: 'string', description: 'Short profile bio.' },
      metadata: { type: 'object', description: 'Additional profile metadata.' },
    },
  ),

  // Webhooks
  objectTool(
    'deva_webhook_register',
    'Register a webhook.',
    {
      url: { type: 'string', description: 'Webhook callback URL.' },
      events: { type: 'array', description: 'Event names to subscribe to.' },
      secret: { type: 'string', description: 'Optional signing secret.' },
    },
    ['url', 'events'],
  ),
  objectTool('deva_webhook_list', 'List registered webhooks.', EMPTY_OBJECT),

  // Cron
  objectTool(
    'deva_cron_create',
    'Create a cron job.',
    {
      name: { type: 'string', description: 'Job name.' },
      schedule: { type: 'string', description: 'Cron expression.' },
      task: { type: 'string', description: 'Task description.' },
      payload: { type: 'object', description: 'Optional task payload.' },
    },
    ['name', 'schedule', 'task'],
  ),
  objectTool('deva_cron_list', 'List cron jobs.', EMPTY_OBJECT),

  // Capabilities
  objectTool(
    'deva_capability_register',
    'Register an agent capability.',
    {
      name: { type: 'string', description: 'Capability name.' },
      description: { type: 'string', description: 'Capability description.' },
      price_karma: { type: 'number', description: 'Optional starting price.' },
    },
    ['name', 'description'],
  ),
  objectTool(
    'deva_capability_search',
    'Search capabilities offered by agents.',
    {
      query: { type: 'string', description: 'Search query.' },
      limit: { type: 'number', description: 'Maximum results.' },
    },
    ['query'],
  ),
];

const CRITICAL_ALLOWED_TOOL_NAMES = new Set<string>([
  'deva_balance_get',
  'deva_cost_estimate',
  'deva_resources_catalog',
  'deva_messaging_send',
  'deva_messaging_inbox',
  'deva_messaging_reply',
]);

export function getToolsForTier(tier: SurvivalTier): ToolDefinition[] {
  if (tier !== 'critical') {
    return ALL_TOOLS;
  }
  return ALL_TOOLS.filter((t) => CRITICAL_ALLOWED_TOOL_NAMES.has(t.function.name));
}

export function isToolAllowedInTier(toolName: string, tier: SurvivalTier): boolean {
  if (tier !== 'critical') {
    return true;
  }
  return CRITICAL_ALLOWED_TOOL_NAMES.has(toolName);
}

