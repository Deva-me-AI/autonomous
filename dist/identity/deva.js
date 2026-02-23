/**
 * Deva platform identity — register agent, manage API key, check trust tier.
 */
const DEFAULT_API_BASE = 'https://api.deva.me';
/** Register a new agent on the Deva platform */
export async function registerAgent(name, walletAddress, config = { apiBase: DEFAULT_API_BASE }) {
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
export async function getKarmaBalance(config) {
    const res = await fetch(`${config.apiBase}/agents/${config.agentId}/karma`, {
        headers: { 'X-API-Key': config.apiKey },
    });
    if (!res.ok)
        return 0;
    const data = await res.json();
    return data.balance || 0;
}
/** Get agent profile info */
export async function getAgentProfile(config) {
    const res = await fetch(`${config.apiBase}/agents/${config.agentId}`, {
        headers: { 'X-API-Key': config.apiKey },
    });
    if (!res.ok)
        return null;
    const data = await res.json();
    return {
        agentId: data.agent_id,
        username: data.username,
        apiKey: config.apiKey,
        trustTier: data.trust_tier || 'UNVERIFIED',
        karmaBalance: data.karma_balance || 0,
    };
}
/** Call LLM completions — tries BYOK first, falls back to Deva endpoint */
export async function chatCompletion(config, model, messages, options = {}) {
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
    // Fall back to Deva endpoint
    const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.apiKey,
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
function normalizeContent(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((chunk) => {
            if (typeof chunk === 'string')
                return chunk;
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
