export interface MonitoredPost {
  platform: string;
  id: string;
  author: string;
  content: string;
  raw_text: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ScoringResult {
  score: number;
  matched_features: string[];
  explanation: string;
}

export interface SanitizationResult {
  clean_text: string;
  threats_detected: string[];
  was_modified: boolean;
}

export interface MonitorConfig {
  polling_interval_ms: number;
  scoring_threshold: number;
  max_posts_per_fetch: number;
}

export type MonitorPostStatus = 'new' | 'scored' | 'candidate' | 'engaged' | 'skipped' | 'rejected';
