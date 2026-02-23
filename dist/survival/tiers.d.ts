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
export declare const TIER_CONFIGS: Record<SurvivalTier, TierConfig>;
/** Determine survival tier from karma balance */
export declare function getTier(karmaBalance: number): SurvivalTier;
/** Get the config for the current tier */
export declare function getTierConfig(karmaBalance: number): TierConfig;
/** Estimate time-to-death based on burn rate */
export declare function estimateTimeToDeathMs(karmaBalance: number, burnRatePerMinute: number): number;
