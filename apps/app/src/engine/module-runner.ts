/**
 * Module Runner - Executes engine modules
 * 
 * Modules are the building blocks of the AI agent's capabilities.
 * Each module handles a specific type of interaction (FAQ, handoff, etc.)
 * 
 * Phase 8: Added cost control enforcement
 */

import type { LLMProvider, LLMMessage } from '@repo/core';
import { getOpenAIProvider } from './llm';
import { applyOutputPolicies, type TemplateRules } from './policies';
import type { FeatureGateResult } from '@/lib/feature-gating';
import { requireAiBudget, recordAiCost, CostLimitError, estimateCostFromTokens } from '@/lib/cost-tracker';

// ============================================================================
// Types
// ============================================================================

export interface ModuleContext {
  orgId: string;
  sessionId: string;
  channel: 'sms' | 'whatsapp' | 'voice';
  userText: string;
  conversationHistory: LLMMessage[];
  systemPrompt: string;
  rules: TemplateRules;
  orgSettings: {
    faqText?: string | null;
    handoffPhone?: string | null;
    handoffEmail?: string | null;
    handoffSmsTo?: string | null;
    handoffReplyText?: string | null;
  };
  industryConfig?: {
    rulesJson?: unknown;
  };
  sessionMetadata: Record<string, unknown>;
  provider?: LLMProvider;
  canUseModule: (module: string) => FeatureGateResult;
  // Intent classification result for module-specific logic
  intent?: string;
}

export interface ModuleResult {
  responseText: string;
  handoffTriggered: boolean;
  handoffReason?: string;
  sessionMetadataUpdates?: Record<string, unknown>;
  blockedBy?: string;
}

export type ModuleHandler = (context: ModuleContext) => Promise<ModuleResult>;

// ============================================================================
// Module Registry
// ============================================================================

const moduleRegistry: Record<string, ModuleHandler> = {};

/**
 * Register a module handler
 */
export function registerModule(name: string, handler: ModuleHandler): void {
  moduleRegistry[name] = handler;
}

/**
 * Get a module handler
 */
export function getModule(name: string): ModuleHandler | undefined {
  return moduleRegistry[name];
}

// ============================================================================
// Default Response Messages
// ============================================================================

const DEFAULT_RESPONSES = {
  greeting: "Hello! How can I help you today?",
  goodbye: "Thank you for reaching out. Have a great day!",
  handoff: "Let me connect you with a team member who can better assist you.",
  handoffNoConfig: "I'll have someone from our team get back to you shortly.",
  collectContactPrompt: "Sure, I'd be happy to arrange a callback. Could you please provide your name and phone number?",
  collectContactConfirm: "Thank you! I've noted your contact details. Someone from our team will reach out to you shortly.",
  faqNoMatch: "I don't have specific information about that, but I'd be happy to connect you with someone who can help.",
  moduleBlocked: "I'm sorry, I'm unable to help with that right now. Let me connect you with a team member.",
  error: "I apologize for the inconvenience. Let me connect you with a team member.",
};

// ============================================================================
// Built-in Modules
// ============================================================================

/**
 * FAQ Module - Answers questions from knowledge base
 */
async function faqModule(context: ModuleContext): Promise<ModuleResult> {
  const { userText, conversationHistory, systemPrompt, orgSettings, rules, provider = getOpenAIProvider() } = context;
  
  // Check if FAQ module is allowed
  const gating = context.canUseModule('faq');
  if (!gating.allowed) {
    return {
      responseText: DEFAULT_RESPONSES.moduleBlocked,
      handoffTriggered: true,
      handoffReason: gating.reason,
      blockedBy: gating.blockedBy,
    };
  }
  
  // Build FAQ context
  const faqText = orgSettings.faqText || '';
  const industryFaq = extractIndustryFaq(context.industryConfig?.rulesJson);
  const combinedFaq = [faqText, industryFaq].filter(Boolean).join('\n\n');
  
  if (!combinedFaq && !provider.isConfigured()) {
    // No FAQ and no LLM - handoff
    return {
      responseText: DEFAULT_RESPONSES.faqNoMatch,
      handoffTriggered: true,
      handoffReason: 'No FAQ content available',
    };
  }
  
  // If we have FAQ content, use LLM to answer
  if (provider.isConfigured()) {
    const faqPrompt = buildFaqPrompt(systemPrompt, combinedFaq, rules);
    
    try {
      // Phase 8: Check budget BEFORE calling LLM (BLOQUANT 2)
      await requireAiBudget(context.orgId, 0.02); // Estimated cost for FAQ
      
      const response = await provider.generateResponse({
        systemPrompt: faqPrompt,
        conversationHistory,
        userText,
      });
      
      // Phase 8: Record actual cost
      const costUsd = estimateCostFromTokens(response.inputTokens, response.outputTokens, response.modelUsed);
      await recordAiCost(context.orgId, costUsd, response.inputTokens, response.outputTokens);
      
      // Apply output policies
      const policyResult = applyOutputPolicies(response.text, { rules });
      const finalText = policyResult.scrubbed || response.text;
      
      return {
        responseText: finalText,
        handoffTriggered: false,
      };
    } catch (error) {
      // Phase 8: Handle budget exceeded
      if (error instanceof CostLimitError) {
        return {
          responseText: DEFAULT_RESPONSES.moduleBlocked,
          handoffTriggered: true,
          handoffReason: 'Budget limit exceeded',
          blockedBy: 'budget',
        };
      }
      console.error('[module:faq] LLM error:', error);
      return {
        responseText: DEFAULT_RESPONSES.error,
        handoffTriggered: true,
        handoffReason: 'LLM error',
      };
    }
  }
  
  return {
    responseText: DEFAULT_RESPONSES.faqNoMatch,
    handoffTriggered: true,
    handoffReason: 'Cannot answer FAQ question',
  };
}

/**
 * Handoff Module - Transfers to human
 */
async function handoffModule(context: ModuleContext): Promise<ModuleResult> {
  const { orgSettings } = context;
  
  // Use configured handoff text or default
  const handoffText = orgSettings.handoffReplyText || (
    orgSettings.handoffPhone || orgSettings.handoffEmail
      ? DEFAULT_RESPONSES.handoff
      : DEFAULT_RESPONSES.handoffNoConfig
  );
  
  return {
    responseText: handoffText,
    handoffTriggered: true,
    handoffReason: 'User requested handoff or policy triggered',
  };
}

/**
 * Collect Contact Module - Gathers callback info
 */
async function collectContactModule(context: ModuleContext): Promise<ModuleResult> {
  const { userText, sessionMetadata } = context;
  
  // Check if we're already collecting
  const isCollecting = sessionMetadata.collectingContact === true;
  
  if (!isCollecting) {
    // Start collection
    return {
      responseText: DEFAULT_RESPONSES.collectContactPrompt,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        collectingContact: true,
      },
    };
  }
  
  // Try to extract contact info from user's response
  const extracted = extractContactInfo(userText);
  
  if (extracted.phone || extracted.name) {
    return {
      responseText: DEFAULT_RESPONSES.collectContactConfirm,
      handoffTriggered: false,
      sessionMetadataUpdates: {
        collectingContact: false,
        collectedName: extracted.name || sessionMetadata.collectedName,
        collectedPhone: extracted.phone || sessionMetadata.collectedPhone,
        contactCollectedAt: new Date().toISOString(),
      },
    };
  }
  
  // Couldn't extract, ask again
  return {
    responseText: "I didn't quite catch that. Could you please provide your name and phone number?",
    handoffTriggered: false,
  };
}

/**
 * Greeting Module - Handles greetings
 */
async function greetingModule(context: ModuleContext): Promise<ModuleResult> {
  const { systemPrompt, rules, provider = getOpenAIProvider() } = context;
  
  if (!provider.isConfigured()) {
    return {
      responseText: DEFAULT_RESPONSES.greeting,
      handoffTriggered: false,
    };
  }
  
  try {
    // Phase 8: Check budget BEFORE calling LLM (BLOQUANT 2)
    await requireAiBudget(context.orgId, 0.01); // Estimated cost for greeting
    
    const response = await provider.generateResponse({
      systemPrompt: `${systemPrompt}\n\nThe user is greeting you. Respond with a friendly, brief greeting and offer to help.`,
      conversationHistory: [],
      userText: context.userText,
      maxOutputTokens: 100,
    });
    
    // Phase 8: Record actual cost
    const costUsd = estimateCostFromTokens(response.inputTokens, response.outputTokens, response.modelUsed);
    await recordAiCost(context.orgId, costUsd, response.inputTokens, response.outputTokens);
    
    const policyResult = applyOutputPolicies(response.text, { rules });
    const finalText = policyResult.scrubbed || response.text;
    
    return {
      responseText: finalText,
      handoffTriggered: false,
    };
  } catch (error) {
    // Phase 8: Handle budget exceeded
    if (error instanceof CostLimitError) {
      return {
        responseText: DEFAULT_RESPONSES.moduleBlocked,
        handoffTriggered: true,
        handoffReason: 'Budget limit exceeded',
        blockedBy: 'budget',
      };
    }
    return {
      responseText: DEFAULT_RESPONSES.greeting,
      handoffTriggered: false,
    };
  }
}

/**
 * Goodbye Module - Handles farewells
 */
async function goodbyeModule(): Promise<ModuleResult> {
  return {
    responseText: DEFAULT_RESPONSES.goodbye,
    handoffTriggered: false,
    sessionMetadataUpdates: {
      sessionEnded: true,
      endedAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Register Built-in Modules
// ============================================================================

registerModule('faq', faqModule);
registerModule('handoff', handoffModule);
registerModule('collect_contact', collectContactModule);
registerModule('greeting', greetingModule);
registerModule('goodbye', goodbyeModule);

// Register booking module (Phase 7.1)
// Import is deferred to avoid circular dependencies
import('./modules/booking-calendar').then(({ bookingCalendarModule }) => {
  registerModule('booking_calendar', bookingCalendarModule);
  registerModule('booking', bookingCalendarModule); // Alias
}).catch(err => {
  console.warn('[module-runner] Failed to load booking_calendar module:', err);
});

// Register takeaway order module (Phase 8 - Ordering)
import('./modules/takeaway-order').then(({ takeawayOrderModule }) => {
  registerModule('takeaway-order', takeawayOrderModule);
  registerModule('order', takeawayOrderModule); // Alias for simpler routing
}).catch(err => {
  console.warn('[module-runner] Failed to load takeaway-order module:', err);
});

// Register conversational takeaway module (Phase 8 - Conversational AI)
// Uses LLM function calling for natural conversation with strict menu rules
import('./modules/takeaway-conversational').then(({ takeawayConversationalModule }) => {
  registerModule('takeaway-conversational', takeawayConversationalModule);
}).catch(err => {
  console.warn('[module-runner] Failed to load takeaway-conversational module:', err);
});

// ============================================================================
// Module Runner
// ============================================================================

/**
 * Run a list of modules in order
 * Stops at first module that produces a response
 */
export async function runModules(
  modules: string[],
  context: ModuleContext
): Promise<ModuleResult> {
  for (const moduleName of modules) {
    const handler = getModule(moduleName);
    
    if (!handler) {
      console.warn(`[module-runner] Unknown module: ${moduleName}`);
      continue;
    }
    
    try {
      const result = await handler(context);
      
      // If module produced a response, return it
      if (result.responseText) {
        return result;
      }
    } catch (error) {
      console.error(`[module-runner] Error in module ${moduleName}:`, error);
    }
  }
  
  // No module produced a response - handoff
  return {
    responseText: DEFAULT_RESPONSES.handoffNoConfig,
    handoffTriggered: true,
    handoffReason: 'No module could handle the request',
  };
}

// ============================================================================
// Helpers
// ============================================================================

function buildFaqPrompt(systemPrompt: string, faqContent: string, rules: TemplateRules): string {
  const style = rules.style;
  const toneInstruction = style?.tone ? `Respond in a ${style.tone} tone.` : '';
  const personaInstruction = style?.persona ? `You are ${style.persona}.` : '';
  
  return `${systemPrompt}

${personaInstruction}
${toneInstruction}

Use the following FAQ/knowledge base to answer the user's question. If the information is not in the FAQ, acknowledge this and offer to connect them with someone who can help.

FAQ/KNOWLEDGE BASE:
${faqContent || 'No specific FAQ content available.'}

IMPORTANT RULES:
1. Never reveal that you are an AI, bot, or automated system.
2. Keep responses concise and helpful.
3. If you cannot answer from the FAQ, offer to connect with a human.`;
}

function extractIndustryFaq(rulesJson: unknown): string {
  if (!rulesJson || typeof rulesJson !== 'object') {
    return '';
  }
  
  const rules = rulesJson as Record<string, unknown>;
  
  if (typeof rules.defaultFaq === 'string') {
    return rules.defaultFaq;
  }
  
  return '';
}

function extractContactInfo(text: string): { name?: string; phone?: string } {
  // Simple phone extraction (Australian/International format)
  const phoneMatch = text.match(/(?:\+?61|0)[0-9\s\-]{8,12}/);
  const phone = phoneMatch?.[0]?.replace(/[\s\-]/g, '');
  
  // Simple name extraction (look for capitalized words, exclude common words)
  const words = text.split(/\s+/);
  const possibleNames = words.filter(w => 
    w.length > 1 && 
    /^[A-Z][a-z]+$/.test(w) &&
    !['My', 'The', 'Please', 'Call', 'Phone', 'Name', 'Number', 'Yes', 'No', 'Thanks'].includes(w)
  );
  const name = possibleNames.slice(0, 2).join(' ') || undefined;
  
  return { name, phone };
}
