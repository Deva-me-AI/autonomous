import type { ScoringResult } from './types.js';

export interface KeywordTier {
  weight: number;
  keywords: string[];
}

export interface PositiveKeywordConfig {
  high: KeywordTier;
  medium: KeywordTier;
  low: KeywordTier;
}

export interface NegativeKeywordConfig {
  weight: number;
  keywords: string[];
}

export interface StructuralBonusConfig {
  question_mark: number;
  how_do_i: number;
  looking_for: number;
  anyone_know: number;
}

export interface ScoringConfig {
  positive_keywords: PositiveKeywordConfig;
  negative_keywords: NegativeKeywordConfig;
  structural_bonuses: StructuralBonusConfig;
}

const STRUCTURAL_PATTERNS: Array<{ key: keyof StructuralBonusConfig; regex: RegExp; feature: string }> = [
  { key: 'how_do_i', regex: /\bhow\s+do\s+i\b/i, feature: 'structural:how_do_i' },
  { key: 'looking_for', regex: /\blooking\s+for\b/i, feature: 'structural:looking_for' },
  { key: 'anyone_know', regex: /\banyone\s+know\b/i, feature: 'structural:anyone_know' },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWordBoundaryRegex(term: string): RegExp {
  const escapedTerm = escapeRegex(term.trim());
  return new RegExp(`(^|[^a-z0-9])${escapedTerm}($|[^a-z0-9])`, 'i');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function scoreTier(
  text: string,
  tierName: 'high' | 'medium' | 'low',
  tier: KeywordTier,
  matchedFeatures: string[],
): number {
  let points = 0;
  for (const keyword of tier.keywords) {
    const term = keyword.trim();
    if (!term) continue;
    if (buildWordBoundaryRegex(term).test(text)) {
      points += tier.weight;
      matchedFeatures.push(`keyword:${tierName}:${term}`);
    }
  }
  return points;
}

export function scoreContent(content: string, config: ScoringConfig): ScoringResult {
  const text = content.trim();

  if (!text) {
    return {
      score: 0,
      matched_features: [],
      explanation: 'No content to score.',
    };
  }

  const matchedFeatures: string[] = [];
  let positivePoints = 0;
  let bonusPoints = 0;
  let penaltyPoints = 0;

  positivePoints += scoreTier(text, 'high', config.positive_keywords.high, matchedFeatures);
  positivePoints += scoreTier(text, 'medium', config.positive_keywords.medium, matchedFeatures);
  positivePoints += scoreTier(text, 'low', config.positive_keywords.low, matchedFeatures);

  for (const keyword of config.negative_keywords.keywords) {
    const term = keyword.trim();
    if (!term) continue;
    if (buildWordBoundaryRegex(term).test(text)) {
      penaltyPoints += config.negative_keywords.weight;
      matchedFeatures.push(`keyword:negative:${term}`);
    }
  }

  if (text.includes('?')) {
    bonusPoints += config.structural_bonuses.question_mark;
    matchedFeatures.push('structural:question_mark');
  }

  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.regex.test(text)) {
      bonusPoints += config.structural_bonuses[pattern.key];
      matchedFeatures.push(pattern.feature);
    }
  }

  const numerator = positivePoints + bonusPoints;
  const denominator = positivePoints + bonusPoints + penaltyPoints + 1;
  const score = clamp(numerator / denominator, 0, 1);

  const explanation = [
    `positive=${positivePoints.toFixed(3)}`,
    `bonuses=${bonusPoints.toFixed(3)}`,
    `penalties=${penaltyPoints.toFixed(3)}`,
  ].join(', ');

  return {
    score,
    matched_features: matchedFeatures,
    explanation,
  };
}
