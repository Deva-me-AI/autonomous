/**
 * Survival tiers — determined by karma balance.
 * Controls model selection, heartbeat frequency, and behavior.
 */

export type SurvivalTier = 'normal' | 'low_compute' | 'critical' | 'dead';

export interface TierConfig {
  tier: SurvivalTier;
  minBalance: number;
  heartbeatIntervalMs: number;
  preferredModels: string[];
  description: string;
}

export const TIER_CONFIGS: Record<SurvivalTier, TierConfig> = {
  normal: {
    tier: 'normal',
    minBalance: 1000,
    heartbeatIntervalMs: 60_000, // 1 minute
    preferredModels: ['claude-opus-4', 'gpt-5', 'gemini-3-pro'],
    description: 'Full capabilities. Frontier models. Fast heartbeat.',
  },
  low_compute: {
    tier: 'low_compute',
    minBalance: 100,
    heartbeatIntervalMs: 300_000, // 5 minutes
    preferredModels: ['claude-sonnet-4', 'gpt-4o', 'gemini-2-flash'],
    description: 'Mid-tier models. Slower heartbeat. Non-essential tasks shed.',
  },
  critical: {
    tier: 'critical',
    minBalance: 1,
    heartbeatIntervalMs: 900_000, // 15 minutes
    preferredModels: ['claude-haiku-3.5', 'gemini-2-flash'],
    description: 'Cheapest models. Survival mode — seek revenue, cut optional spending.',
  },
  dead: {
    tier: 'dead',
    minBalance: 0,
    heartbeatIntervalMs: Infinity,
    preferredModels: [],
    description: 'Balance is zero. Agent loop stopped. 24h grace period before termination.',
  },
};

/** Determine survival tier from karma balance */
export function getTier(karmaBalance: number): SurvivalTier {
  if (karmaBalance <= 0) return 'dead';
  if (karmaBalance < 100) return 'critical';
  if (karmaBalance < 1000) return 'low_compute';
  return 'normal';
}

/** Get the config for the current tier */
export function getTierConfig(karmaBalance: number): TierConfig {
  return TIER_CONFIGS[getTier(karmaBalance)];
}

/** Estimate time-to-death based on burn rate */
export function estimateTimeToDeathMs(
  karmaBalance: number,
  burnRatePerMinute: number,
): number {
  if (burnRatePerMinute <= 0) return Infinity;
  return (karmaBalance / burnRatePerMinute) * 60_000;
}
