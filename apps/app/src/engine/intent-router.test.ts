/**
 * Intent Router Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntentRouter, createIntentRouter, DEFAULT_INTENTS } from './intent-router';
import { getDefaultRules } from './policies';
import type { LLMProvider, IntentClassificationResult } from '@repo/core';

// Mock LLM Provider
function createMockProvider(classifyResult: Partial<IntentClassificationResult>): LLMProvider {
  return {
    name: 'mock',
    isConfigured: () => true,
    classifyIntent: vi.fn().mockResolvedValue({
      intent: 'faq',
      confidence: 0.85,
      rationale: 'Test classification',
      ...classifyResult,
    }),
    generateResponse: vi.fn().mockResolvedValue({
      text: 'Mock response',
      inputTokens: 10,
      outputTokens: 20,
      modelUsed: 'mock-model',
    }),
  };
}

describe('IntentRouter', () => {
  const systemPrompt = 'You are a helpful assistant.';
  const rules = getDefaultRules();

  describe('classify', () => {
    it('should classify intent with high confidence', async () => {
      const provider = createMockProvider({
        intent: 'faq',
        confidence: 0.9,
      });

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('What are your hours?');

      expect(result.intent).toBe('faq');
      expect(result.confidence).toBe(0.9);
      expect(result.requiresHandoff).toBe(false);
    });

    it('should trigger handoff on low confidence', async () => {
      const provider = createMockProvider({
        intent: 'faq',
        confidence: 0.4,
      });

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules: { ...rules, confidenceThreshold: 0.65 },
      });

      const result = await router.classify('Something unclear');

      expect(result.requiresHandoff).toBe(true);
      expect(result.handoffReason).toContain('0.40');
    });

    it('should trigger handoff for handoff intent', async () => {
      const provider = createMockProvider({
        intent: 'handoff',
        confidence: 0.95,
      });

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('I want to speak to a human');

      expect(result.intent).toBe('handoff');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should trigger handoff for unknown intent', async () => {
      const provider = createMockProvider({
        intent: 'unknown',
        confidence: 0.3,
      });

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('asdfghjkl');

      expect(result.intent).toBe('unknown');
      expect(result.requiresHandoff).toBe(true);
    });

    it('should handle provider not configured', async () => {
      const provider: LLMProvider = {
        name: 'unconfigured',
        isConfigured: () => false,
        classifyIntent: vi.fn(),
        generateResponse: vi.fn(),
      };

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('Hello');

      expect(result.intent).toBe('handoff');
      expect(result.requiresHandoff).toBe(true);
      expect(result.handoffReason).toContain('not configured');
    });

    it('should handle classification error', async () => {
      const provider: LLMProvider = {
        name: 'error',
        isConfigured: () => true,
        classifyIntent: vi.fn().mockRejectedValue(new Error('API error')),
        generateResponse: vi.fn(),
      };

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('Hello');

      expect(result.intent).toBe('unknown');
      expect(result.requiresHandoff).toBe(true);
      expect(result.handoffReason).toContain('error');
    });

    it('should map intents to modules', async () => {
      const provider = createMockProvider({
        intent: 'greeting',
        confidence: 0.95,
      });

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('Hello!');

      expect(result.suggestedModules).toContain('greeting');
    });

    it('should use suggested modules from classification', async () => {
      const provider = createMockProvider({
        intent: 'faq',
        confidence: 0.9,
        suggestedModules: ['faq', 'collect_contact'],
      });

      const router = new IntentRouter({
        provider,
        systemPrompt,
        intents: DEFAULT_INTENTS,
        rules,
      });

      const result = await router.classify('What are your hours?');

      expect(result.suggestedModules).toEqual(['faq', 'collect_contact']);
    });
  });
});

describe('createIntentRouter', () => {
  it('should create router with parsed intents', () => {
    const router = createIntentRouter(
      'System prompt',
      ['greeting', 'faq', 'booking'],
      getDefaultRules()
    );

    expect(router).toBeInstanceOf(IntentRouter);
  });

  it('should use default intents if none provided', () => {
    const router = createIntentRouter(
      'System prompt',
      [],
      getDefaultRules()
    );

    expect(router).toBeInstanceOf(IntentRouter);
  });

  it('should filter invalid intents', () => {
    const router = createIntentRouter(
      'System prompt',
      ['valid', 123, null, 'also-valid'] as unknown[],
      getDefaultRules()
    );

    expect(router).toBeInstanceOf(IntentRouter);
  });
});
