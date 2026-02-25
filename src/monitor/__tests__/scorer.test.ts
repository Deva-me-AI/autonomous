import { describe, expect, it } from 'vitest';
import { scoreContent, type ScoringConfig } from '../scorer.js';

const config: ScoringConfig = {
  positive_keywords: {
    high: { weight: 1, keywords: ['urgent', 'blocked'] },
    medium: { weight: 0.6, keywords: ['compare', 'evaluate'] },
    low: { weight: 0.3, keywords: ['tips', 'help'] },
  },
  negative_keywords: {
    weight: 0.8,
    keywords: ['spam', 'off-topic'],
  },
  structural_bonuses: {
    question_mark: 0.25,
    how_do_i: 0.4,
    looking_for: 0.5,
    anyone_know: 0.4,
  },
};

describe('scoreContent', () => {
  it('matches keywords by tier', () => {
    const result = scoreContent('Need urgent help to compare options.', config);
    expect(result.matched_features).toContain('keyword:high:urgent');
    expect(result.matched_features).toContain('keyword:medium:compare');
    expect(result.matched_features).toContain('keyword:low:help');
  });

  it('applies question detection bonuses', () => {
    const result = scoreContent('How do I migrate this setup? Anyone know?', config);
    expect(result.matched_features).toContain('structural:question_mark');
    expect(result.matched_features).toContain('structural:how_do_i');
    expect(result.matched_features).toContain('structural:anyone_know');
  });

  it('applies negative keyword penalties', () => {
    const withoutPenalty = scoreContent('urgent blocked migration issue', config);
    const withPenalty = scoreContent('urgent blocked migration issue spam', config);
    expect(withPenalty.score).toBeLessThan(withoutPenalty.score);
    expect(withPenalty.matched_features).toContain('keyword:negative:spam');
  });

  it('always returns a normalized score between 0 and 1', () => {
    const result = scoreContent('urgent compare help? anyone know', config);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('handles empty content', () => {
    const result = scoreContent('   ', config);
    expect(result.score).toBe(0);
    expect(result.matched_features).toEqual([]);
  });
});
