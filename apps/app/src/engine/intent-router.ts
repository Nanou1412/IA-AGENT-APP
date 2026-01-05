/**
 * Intent Router - Classifies user intent and routes to appropriate module
 * 
 * Uses LLM for intent classification with fallback handling.
 */

import type { LLMProvider, IntentClassificationResult, LLMMessage } from '@repo/core';
import { getOpenAIProvider } from './llm';
import { checkConfidencePolicy, type TemplateRules } from './policies';

// ============================================================================
// Types
// ============================================================================

export interface IntentRouterConfig {
  provider?: LLMProvider;
  systemPrompt: string;
  intents: string[];
  rules: TemplateRules;
}

export interface RouteResult {
  intent: string;
  confidence: number;
  rationale?: string;
  suggestedModules: string[];
  requiresHandoff: boolean;
  handoffReason?: string;
}

// ============================================================================
// Default Intents
// ============================================================================

/**
 * Default intents available to all templates
 */
export const DEFAULT_INTENTS = [
  'greeting',       // Hello, hi, good morning
  'faq',            // General questions about the business
  'handoff',        // Request to speak to a human
  'collect_contact',// Request callback / leave contact info
  'goodbye',        // Ending conversation
  'unknown',        // Cannot determine intent
];

// ============================================================================
// Intent Router
// ============================================================================

export class IntentRouter {
  private provider: LLMProvider;
  private systemPrompt: string;
  private intents: string[];
  private rules: TemplateRules;
  
  constructor(config: IntentRouterConfig) {
    this.provider = config.provider || getOpenAIProvider();
    this.systemPrompt = config.systemPrompt;
    this.intents = config.intents.length > 0 ? config.intents : DEFAULT_INTENTS;
    this.rules = config.rules;
  }
  
  /**
   * Classify user message and determine routing
   */
  async classify(
    userText: string,
    conversationHistory: LLMMessage[] = []
  ): Promise<RouteResult> {
    // Check if LLM is configured
    if (!this.provider.isConfigured()) {
      console.warn('[intent-router] LLM not configured, defaulting to handoff');
      return {
        intent: 'handoff',
        confidence: 0,
        rationale: 'LLM not configured',
        suggestedModules: ['handoff'],
        requiresHandoff: true,
        handoffReason: 'AI engine not configured',
      };
    }
    
    try {
      const classification = await this.provider.classifyIntent({
        systemPrompt: this.systemPrompt,
        intents: this.intents,
        conversationHistory,
        userText,
        confidenceThreshold: this.rules.confidenceThreshold,
      });
      
      return this.processClassification(classification);
      
    } catch (error) {
      console.error('[intent-router] Classification error:', error);
      
      // On error, trigger handoff
      return {
        intent: 'unknown',
        confidence: 0,
        rationale: `Classification error: ${error instanceof Error ? error.message : 'unknown'}`,
        suggestedModules: ['handoff'],
        requiresHandoff: true,
        handoffReason: 'Classification error',
      };
    }
  }
  
  /**
   * Process classification result and check policies
   */
  private processClassification(classification: IntentClassificationResult): RouteResult {
    const { intent, confidence, rationale, suggestedModules } = classification;
    
    // Check confidence policy
    const confidenceCheck = checkConfidencePolicy(confidence, { rules: this.rules });
    
    if (!confidenceCheck.passed) {
      return {
        intent,
        confidence,
        rationale,
        suggestedModules: ['handoff'],
        requiresHandoff: true,
        handoffReason: confidenceCheck.reason,
      };
    }
    
    // Map intent to modules
    const modules = this.mapIntentToModules(intent, suggestedModules);
    
    // Check if intent itself requires handoff
    const requiresHandoff = intent === 'handoff' || intent === 'unknown';
    
    return {
      intent,
      confidence,
      rationale,
      suggestedModules: modules,
      requiresHandoff,
      handoffReason: requiresHandoff ? `Intent: ${intent}` : undefined,
    };
  }
  
  /**
   * Map intent to list of modules to execute
   */
  private mapIntentToModules(intent: string, suggested?: string[]): string[] {
    // Use suggested modules if provided
    if (suggested && suggested.length > 0) {
      return suggested;
    }
    
    // Default mapping
    switch (intent) {
      case 'greeting':
        return ['greeting'];
      case 'faq':
        return ['faq'];
      case 'handoff':
        return ['handoff'];
      case 'collect_contact':
        return ['collect_contact'];
      case 'goodbye':
        return ['goodbye'];
      case 'unknown':
      default:
        return ['handoff']; // Default to handoff for unknown
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an intent router from template configuration
 */
export function createIntentRouter(
  systemPrompt: string,
  intentsAllowed: unknown,
  rules: TemplateRules,
  provider?: LLMProvider
): IntentRouter {
  // Parse intents from JSON
  const intents = Array.isArray(intentsAllowed)
    ? intentsAllowed.filter((i): i is string => typeof i === 'string')
    : DEFAULT_INTENTS;
  
  return new IntentRouter({
    provider,
    systemPrompt,
    intents,
    rules,
  });
}
