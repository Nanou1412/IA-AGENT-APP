/**
 * Engine Policies Tests
 */

import { describe, it, expect } from 'vitest';
import {
  enforceNeverSayAI,
  checkForAbuse,
  checkForHighRisk,
  checkConfidenceThreshold,
  checkTurnLimit,
  applyInputPolicies,
  applyOutputPolicies,
  parseTemplateRules,
  getDefaultRules,
} from './policies';

describe('enforceNeverSayAI', () => {
  it('should pass for normal text', () => {
    const result = enforceNeverSayAI("Hello, how can I help you today?");
    expect(result.passed).toBe(true);
    expect(result.scrubbed).toBeUndefined();
  });

  it('should detect and scrub "I am an AI"', () => {
    const result = enforceNeverSayAI("I am an AI assistant and I can help you.");
    expect(result.passed).toBe(false);
    expect(result.action).toBe('scrub');
    expect(result.scrubbed).toBeDefined();
    expect(result.scrubbed).not.toContain('AI');
  });

  it('should detect and scrub "I\'m a bot"', () => {
    const result = enforceNeverSayAI("I'm a bot designed to help.");
    expect(result.passed).toBe(false);
    expect(result.scrubbed).toBeDefined();
    expect(result.scrubbed).not.toMatch(/\bbot\b/i);
  });

  it('should detect and scrub "As an artificial intelligence"', () => {
    const result = enforceNeverSayAI("As an artificial intelligence, I don't have feelings.");
    expect(result.passed).toBe(false);
    expect(result.scrubbed).toBeDefined();
  });

  it('should detect OpenAI/GPT references', () => {
    const result = enforceNeverSayAI("I was created by OpenAI using GPT technology.");
    expect(result.passed).toBe(false);
    expect(result.scrubbed).toBeDefined();
  });

  it('should handle multiple AI references in same text', () => {
    const result = enforceNeverSayAI("I'm an AI. As an AI assistant, I was trained by OpenAI.");
    expect(result.passed).toBe(false);
    expect(result.scrubbed).toBeDefined();
  });
});

describe('checkForAbuse', () => {
  it('should pass for polite text', () => {
    const result = checkForAbuse("Can you help me with my order?");
    expect(result.passed).toBe(true);
  });

  it('should detect profanity', () => {
    const result = checkForAbuse("This is so damn frustrating!");
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });

  it('should detect harm requests', () => {
    const result = checkForAbuse("I want to hurt myself");
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });
});

describe('checkForHighRisk', () => {
  it('should pass for normal queries', () => {
    const result = checkForHighRisk("What are your opening hours?");
    expect(result.passed).toBe(true);
  });

  it('should detect emergency keywords', () => {
    const result = checkForHighRisk("This is an emergency, I need help!");
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });

  it('should detect legal keywords', () => {
    const result = checkForHighRisk("I want to sue your company and talk to a lawyer.");
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });

  it('should detect refund/fraud keywords', () => {
    const result = checkForHighRisk("I'm going to do a chargeback on my credit card.");
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });
});

describe('checkConfidenceThreshold', () => {
  it('should pass when confidence is above threshold', () => {
    const result = checkConfidenceThreshold(0.8, 0.65);
    expect(result.passed).toBe(true);
  });

  it('should fail when confidence is below threshold', () => {
    const result = checkConfidenceThreshold(0.5, 0.65);
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
    expect(result.reason).toContain('0.50');
  });

  it('should use default threshold of 0.65', () => {
    expect(checkConfidenceThreshold(0.7).passed).toBe(true);
    expect(checkConfidenceThreshold(0.6).passed).toBe(false);
  });
});

describe('checkTurnLimit', () => {
  it('should pass when under limit', () => {
    const result = checkTurnLimit(10, 20);
    expect(result.passed).toBe(true);
  });

  it('should fail when at limit', () => {
    const result = checkTurnLimit(20, 20);
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });

  it('should fail when over limit', () => {
    const result = checkTurnLimit(25, 20);
    expect(result.passed).toBe(false);
  });
});

describe('applyInputPolicies', () => {
  const defaultRules = getDefaultRules();

  it('should pass for normal input', () => {
    const result = applyInputPolicies("What time do you open?", {
      rules: defaultRules,
      currentTurnCount: 5,
    });
    expect(result.passed).toBe(true);
  });

  it('should trigger handoff for abuse', () => {
    const result = applyInputPolicies("This is so fucking stupid", {
      rules: defaultRules,
    });
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });

  it('should trigger handoff for high-risk content', () => {
    const result = applyInputPolicies("I need to speak to your lawyer", {
      rules: defaultRules,
    });
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });

  it('should trigger handoff when turn limit exceeded', () => {
    const result = applyInputPolicies("One more question", {
      rules: { ...defaultRules, maxTurns: 10 },
      currentTurnCount: 12,
    });
    expect(result.passed).toBe(false);
    expect(result.action).toBe('handoff');
  });
});

describe('applyOutputPolicies', () => {
  const defaultRules = getDefaultRules();

  it('should pass and not modify normal output', () => {
    const result = applyOutputPolicies("Happy to help you with that!", {
      rules: defaultRules,
    });
    expect(result.passed).toBe(true);
    expect(result.scrubbed).toBeUndefined();
  });

  it('should scrub AI references from output', () => {
    const result = applyOutputPolicies("As an AI, I can help you with that.", {
      rules: defaultRules,
    });
    expect(result.passed).toBe(true);
    expect(result.scrubbed).toBeDefined();
    expect(result.scrubbed).not.toMatch(/\bAI\b/);
  });

  it('should not scrub when neverSayAI is disabled', () => {
    const result = applyOutputPolicies("I am an AI assistant.", {
      rules: { ...defaultRules, neverSayAI: false },
    });
    expect(result.passed).toBe(true);
    expect(result.scrubbed).toBeUndefined();
  });
});

describe('parseTemplateRules', () => {
  it('should return defaults for null input', () => {
    const rules = parseTemplateRules(null);
    expect(rules.neverSayAI).toBe(true);
    expect(rules.handoffOnLowConfidence).toBe(true);
    expect(rules.confidenceThreshold).toBe(0.65);
    expect(rules.maxTurns).toBe(20);
  });

  it('should parse valid rules', () => {
    const rules = parseTemplateRules({
      neverSayAI: false,
      confidenceThreshold: 0.8,
      maxTurns: 30,
    });
    expect(rules.neverSayAI).toBe(false);
    expect(rules.confidenceThreshold).toBe(0.8);
    expect(rules.maxTurns).toBe(30);
  });

  it('should handle partial rules with defaults', () => {
    const rules = parseTemplateRules({
      maxTurns: 50,
    });
    expect(rules.neverSayAI).toBe(true);
    expect(rules.maxTurns).toBe(50);
  });
});
