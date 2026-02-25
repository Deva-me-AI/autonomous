import type { SanitizationResult } from './types.js';

const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

const PROMPT_INJECTION_PATTERNS: Array<{ threat: string; regex: RegExp }> = [
  { threat: 'prompt_injection:[INST]', regex: /\[INST\]/i },
  { threat: 'prompt_injection:<<SYS>>', regex: /<<SYS>>/i },
  { threat: 'prompt_injection:human_block', regex: /\n\nHuman:/i },
  { threat: 'prompt_injection:assistant_block', regex: /\n\nAssistant:/i },
  { threat: 'suspicious_uri:data', regex: /\bdata\s*:/i },
  { threat: 'suspicious_uri:javascript', regex: /\bjavascript\s*:/i },
];

function detectHomoglyphThreat(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.some((token) => {
    const hasAscii = /[A-Za-z]/.test(token);
    const hasNonAscii = /[^\x00-\x7F]/.test(token);
    return hasAscii && hasNonAscii;
  });
}

export function sanitizeContent(input: string): SanitizationResult {
  const threatsDetected: string[] = [];
  const normalized = input.normalize('NFKC');
  const cleanText = normalized.replace(ZERO_WIDTH_RE, '');

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.regex.test(cleanText)) {
      threatsDetected.push(pattern.threat);
    }
  }

  if (detectHomoglyphThreat(cleanText)) {
    threatsDetected.push('homoglyph_suspected');
  }

  return {
    clean_text: cleanText,
    threats_detected: threatsDetected,
    was_modified: cleanText !== input,
  };
}
