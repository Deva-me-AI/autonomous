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
/** Resolve inference config from environment */
export function resolveInferenceConfig() {
    const provider = (process.env.DEVA_LLM_PROVIDER || 'openai');
    switch (provider) {
        case 'openai': {
            const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
            if (!apiKey)
                return null;
            return {
                provider: 'openai',
                apiKey,
                baseUrl: process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://api.openai.com/v1',
                model: process.env.DEVA_LLM_MODEL,
            };
        }
        case 'anthropic': {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey)
                return null;
            return {
                provider: 'anthropic',
                apiKey,
                baseUrl: 'https://api.anthropic.com',
                model: process.env.DEVA_LLM_MODEL,
            };
        }
        case 'google': {
            const apiKey = process.env.GOOGLE_API_KEY;
            if (!apiKey)
                return null;
            return {
                provider: 'google',
                apiKey,
                baseUrl: 'https://generativelanguage.googleapis.com',
                model: process.env.DEVA_LLM_MODEL,
            };
        }
        case 'deva':
        default:
            return null; // Fall through to Deva endpoint
    }
}
/** Call OpenAI-compatible API (works for OpenAI, OpenRouter, any compatible endpoint) */
export async function openaiCompletion(config, model, messages, options = {}) {
    const url = `${config.baseUrl}/chat/completions`;
    const body = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
    };
    if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
    }
    const res = await fetch(url, {
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
    const data = await res.json();
    const choices = data.choices;
    const choice = choices?.[0]?.message;
    const content = normalizeContent(choice?.content);
    const toolCalls = Array.isArray(choice?.tool_calls)
        ? choice.tool_calls
        : [];
    const usage = data.usage;
    return {
        content,
        toolCalls,
        tokensUsed: usage?.total_tokens || 0,
        karmaCost: 0, // BYOK doesn't cost karma
    };
}
/** Call Anthropic Messages API */
export async function anthropicCompletion(config, model, messages, options = {}) {
    // Convert OpenAI format to Anthropic format
    const systemMsg = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const anthropicMessages = nonSystemMessages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.role === 'tool'
            ? `[Tool Result for ${m.tool_call_id}]: ${m.content || ''}`
            : m.content || '',
    }));
    const body = {
        model,
        max_tokens: options.maxTokens ?? 4096,
        messages: anthropicMessages,
        temperature: options.temperature ?? 0.7,
    };
    if (systemMsg?.content) {
        body.system = systemMsg.content;
    }
    if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters,
        }));
    }
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Anthropic request failed: ${res.status} ${errBody}`);
    }
    const data = await res.json();
    const contentBlocks = data.content;
    let textContent = '';
    const toolCalls = [];
    if (contentBlocks) {
        for (const block of contentBlocks) {
            if (block.type === 'text') {
                textContent += block.text;
            }
            else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    type: 'function',
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input),
                    },
                });
            }
        }
    }
    const usage = data.usage;
    return {
        content: textContent,
        toolCalls,
        tokensUsed: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
        karmaCost: 0,
    };
}
/** Unified completion — routes to the right provider */
export async function byokCompletion(config, model, messages, options = {}) {
    switch (config.provider) {
        case 'openai':
            return openaiCompletion(config, model, messages, options);
        case 'anthropic':
            return anthropicCompletion(config, model, messages, options);
        default:
            throw new Error(`Unsupported BYOK provider: ${config.provider}`);
    }
}
function normalizeContent(content) {
    if (typeof content === 'string')
        return content;
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
