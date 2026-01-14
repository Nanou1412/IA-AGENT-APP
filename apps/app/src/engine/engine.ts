/**
 * AI Engine - Main orchestration point
 * 
 * Handles the full lifecycle of an AI interaction:
 * 1. Load configuration (template, industry, org)
 * 2. Get/create conversation session
 * 3. Apply input policies
 * 4. Classify intent
 * 5. Check feature gating
 * 6. Run modules
 * 7. Apply output policies
 * 8. Adapt for channel
 * 9. Log engine run
 * 10. Return response
 * 
 * Phase 8: Uses canUseModuleWithKillSwitch for kill switch enforcement
 * 
 * Refactored: Session management → session-manager.ts
 * Refactored: Run tracking → run-tracker.ts
 * Refactored: Context loading → context-loader.ts
 */

import { prisma } from '@/lib/prisma';
import { 
  MessagingChannel, 
  EngineRunStatus,
  SandboxStatus,
  SensitiveModulesStatus,
  BillingStatus,
} from '@prisma/client';
import { canUseModuleWithKillSwitch, type FeatureGateResult, type OrgContextWithIndustry } from '@/lib/feature-gating';

import { getOpenAIProvider, createOpenAIProvider } from './llm';
import { createIntentRouter } from './intent-router';
import { runModules, type ModuleContext } from './module-runner';
import { applyInputPolicies, applyOutputPolicies, parseTemplateRules, getDefaultRules } from './policies';
import { adaptForChannel } from './adapters';
import { checkRateLimit } from './rate-limiter';
import { requireAiBudget, recordAiCost, estimateCostFromTokens } from '@/lib/cost-tracker';
import { parseTakeawayConfig } from '@/lib/takeaway/takeaway-config';

// Refactored modules
import { 
  getOrCreateSession, 
  loadConversationHistory, 
  saveConversationTurn, 
  getSessionMetadata, 
  updateSessionMetadata,
  normalizePhone 
} from './session-manager';
import { createEngineRun, logEngineAudit } from './run-tracker';
import { loadEngineContext } from './context-loader';

// ============================================================================
// Types
// ============================================================================

export interface EngineInput {
  orgId: string;
  channel: MessagingChannel;
  contactKey: string; // Normalized phone or identifier
  userText: string;
  externalThreadKey?: string; // Optional: CallSid, thread ID
  raw?: Record<string, unknown>;
}

export interface EngineOutput {
  responseText: string;
  sessionId: string;
  handoffTriggered: boolean;
  handoffReason?: string;
  blocked: boolean;
  blockedBy?: string;
  engineRunId: string;
  inputTokens?: number;
  outputTokens?: number;
}

// Re-export EngineContext from context-loader
export type { EngineContext } from './context-loader';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant for a business. Your goal is to assist customers with their inquiries in a friendly and professional manner.

IMPORTANT RULES:
1. Never reveal that you are an AI, bot, or automated system.
2. Be concise and helpful.
3. If you cannot help, offer to connect with a human team member.
4. Be polite and professional at all times.`;

const FALLBACK_RESPONSES = {
  blocked: "I'm sorry, I'm unable to assist right now. Please try again later or contact us directly.",
  error: "I apologize for the inconvenience. Let me connect you with a team member who can help.",
  handoff: "Let me connect you with a team member who can better assist you.",
  rateLimited: "We're experiencing high demand. Please try again in a moment, or I can have someone call you back.",
};

// ============================================================================
// Main Engine Function
// ============================================================================

/**
 * Handle an inbound message through the AI engine
 */
export async function handleInboundMessage(input: EngineInput): Promise<EngineOutput> {
  const startTime = Date.now();
  const { orgId, channel, contactKey, userText, externalThreadKey, raw } = input;
  
  let engineRunId = '';
  let sessionId = '';
  
  try {
    // 1. Rate limit check (Redis-backed in production)
    const rateLimitResult = await checkRateLimit(orgId);
    
    if (!rateLimitResult.allowed) {
      const run = await createEngineRun({
        orgId,                       // Phase 8: For rate limiting
        sessionId: '', // No session yet
        status: EngineRunStatus.blocked,
        blockedBy: 'rate_limit',
        errorMessage: rateLimitResult.reason,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
      });
      
      return {
        responseText: FALLBACK_RESPONSES.rateLimited,
        sessionId: '',
        handoffTriggered: true,
        handoffReason: rateLimitResult.reason,
        blocked: true,
        blockedBy: 'rate_limit',
        engineRunId: run.id,
      };
    }
    
    // 2. Load context (org, settings, template)
    const context = await loadEngineContext(orgId);
    
    if (!context) {
      const run = await createEngineRun({
        orgId,                       // Phase 8: For rate limiting
        sessionId: '',
        status: EngineRunStatus.error,
        errorMessage: 'Failed to load engine context',
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
      });
      
      return {
        responseText: FALLBACK_RESPONSES.error,
        sessionId: '',
        handoffTriggered: true,
        handoffReason: 'Configuration error',
        blocked: true,
        blockedBy: 'config',
        engineRunId: run.id,
      };
    }
    
    // 3. Get or create session
    const sessionResult = await getOrCreateSession(orgId, channel, contactKey, externalThreadKey);
    sessionId = sessionResult.id;
    
    // 4. Load conversation history
    const conversationHistory = await loadConversationHistory(sessionId);
    
    // 5. Parse template rules
    const rules = context.template?.definition 
      ? parseTemplateRules(context.template.definition)
      : getDefaultRules();
    
    // 6. Apply input policies
    const inputPolicyResult = applyInputPolicies(userText, {
      rules,
      currentTurnCount: conversationHistory.length,
    });
    
    if (!inputPolicyResult.passed) {
      // Input policy triggered handoff
      const run = await createEngineRun({
        orgId,                       // Phase 8: For rate limiting
        sessionId,
        agentTemplateId: context.template?.id,
        industryConfigId: context.org.industryConfig?.id,
        status: EngineRunStatus.handoff,
        decision: { reason: inputPolicyResult.reason, action: inputPolicyResult.action },
        modelUsed: 'policy',
        durationMs: Date.now() - startTime,
      });
      
      await saveConversationTurn(sessionId, channel, 'user', userText, raw);
      await saveConversationTurn(sessionId, channel, 'assistant', FALLBACK_RESPONSES.handoff);
      
      await logEngineAudit('engine.handoff_triggered', {
        reason: inputPolicyResult.reason,
        trigger: 'input_policy',
      }, { orgId, sessionId });
      
      return {
        responseText: adaptForChannel(FALLBACK_RESPONSES.handoff, channel).formattedText,
        sessionId,
        handoffTriggered: true,
        handoffReason: inputPolicyResult.reason,
        blocked: false,
        engineRunId: run.id,
      };
    }
    
    // 7. Save user turn
    await saveConversationTurn(sessionId, channel, 'user', userText, raw);
    
    // 8. Get LLM provider (with optional org override)
    const provider = context.settings.aiModelOverride
      ? createOpenAIProvider({ defaultModel: context.settings.aiModelOverride })
      : getOpenAIProvider();
    
    // 9. Classify intent
    const systemPrompt = context.template?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const intentsAllowed = context.template?.intentsAllowed;
    
    // Extract intent definitions from template for enriched classification
    const templateDefinition = context.template?.definition as { intents?: Record<string, { description?: string; examples?: string[] }> } | undefined;
    const intentDefinitions = templateDefinition?.intents;
    
    const intentRouter = createIntentRouter(systemPrompt, intentsAllowed, rules, provider, intentDefinitions);
    const routeResult = await intentRouter.classify(userText, conversationHistory);
    
    // 10. Check if handoff required by confidence
    if (routeResult.requiresHandoff) {
      const run = await createEngineRun({
        orgId,                       // Phase 8: For rate limiting
        sessionId,
        agentTemplateId: context.template?.id,
        industryConfigId: context.org.industryConfig?.id,
        status: EngineRunStatus.handoff,
        decision: { 
          intent: routeResult.intent, 
          confidence: routeResult.confidence,
          reason: routeResult.handoffReason,
        },
        modelUsed: provider.name,
        durationMs: Date.now() - startTime,
      });
      
      const handoffResponse = context.settings.handoffReplyText || FALLBACK_RESPONSES.handoff;
      await saveConversationTurn(sessionId, channel, 'assistant', handoffResponse);
      
      await logEngineAudit('engine.handoff_triggered', {
        intent: routeResult.intent,
        confidence: routeResult.confidence,
        reason: routeResult.handoffReason,
      }, { orgId, sessionId });
      
      return {
        responseText: adaptForChannel(handoffResponse, channel).formattedText,
        sessionId,
        handoffTriggered: true,
        handoffReason: routeResult.handoffReason,
        blocked: false,
        engineRunId: run.id,
      };
    }
    
    // 11. Build gating context
    const gatingContext: OrgContextWithIndustry = {
      org: {
        id: context.org.id,
        name: context.org.name,
        industry: context.org.industry,
        timezone: 'Australia/Sydney',
        industryConfigId: context.org.industryConfig?.id || null,
        stripeAccountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        industryConfig: context.org.industryConfig ? {
          id: context.org.industryConfig.id,
          slug: context.org.industryConfig.slug,
          title: context.org.industryConfig.slug,
          rulesJson: context.org.industryConfig.rulesJson as object,
          defaultTemplateSlug: null,
          defaultTemplateVersion: null,
          onboardingSteps: [],
          modules: context.org.industryConfig.modules as object,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as const : null,
      },
      settings: {
        id: context.settings.id,
        orgId,
        sandboxStatus: context.settings.sandboxStatus as SandboxStatus,
        sensitiveModulesStatus: SensitiveModulesStatus.enabled,
        billingStatus: context.settings.billingStatus as BillingStatus,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        setupFeePaidAt: null,
        currentPeriodEnd: null,
        smsEnabled: true,
        whatsappEnabled: true,
        voiceEnabled: true,
        callQueueEnabled: true,
        callWelcomeText: null,
        callQueueWaitText: null,
        callDenyText: null,
        callHandoffNumber: context.settings.handoffPhone || null,
        recordCalls: false,
        messagingLocale: 'en-AU',
        defaultInboundReplyText: null,
        deniedReplyText: null,
        handoffReplyText: context.settings.handoffReplyText || null,
        handoffPhone: context.settings.handoffPhone || null,
        handoffEmail: context.settings.handoffEmail || null,
        handoffSmsTo: context.settings.handoffSmsTo || null,
        faqText: context.settings.faqText || null,
        aiModelOverride: context.settings.aiModelOverride || null,
        bookingConfig: null, // Phase 7.1 - booking config
        takeawayConfig: null, // Phase 7.2 - takeaway config
        takeawayPaymentConfig: null, // Phase 7.3 - payment config
        menuConfig: null, // Menu config for takeaway
        // Phase 8: Production Readiness fields
        monthlyAiBudgetUsd: 50,
        monthlyTwilioBudgetUsd: 30,
        hardBudgetLimit: true,
        maxEngineRunsPerMinute: 60,
        maxMessagesPerMinute: 30,
        aiDisabled: false,
        smsDisabled: false,
        voiceDisabled: false,
        bookingDisabled: false,
        takeawayDisabled: false,
        paymentDisabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      industryConfig: context.org.industryConfig ? {
        id: context.org.industryConfig.id,
        slug: context.org.industryConfig.slug,
        title: context.org.industryConfig.slug,
        rulesJson: context.org.industryConfig.rulesJson as object,
        defaultTemplateSlug: null,
        defaultTemplateVersion: null,
        onboardingSteps: [],
        modules: context.org.industryConfig.modules as object,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as const : null,
    };
    
    // 12. Build module context
    const moduleContext: ModuleContext = {
      orgId,
      sessionId,
      channel: channel as 'sms' | 'whatsapp' | 'voice',
      userText,
      conversationHistory,
      systemPrompt,
      rules,
      orgSettings: {
        faqText: context.settings.faqText,
        handoffPhone: context.settings.handoffPhone,
        handoffEmail: context.settings.handoffEmail,
        handoffSmsTo: context.settings.handoffSmsTo,
        handoffReplyText: context.settings.handoffReplyText,
      },
      industryConfig: context.org.industryConfig ? {
        rulesJson: context.org.industryConfig.rulesJson,
      } : undefined,
      sessionMetadata: (await getSessionMetadata(sessionId)) || {},
      provider,
      canUseModule: (module: string): FeatureGateResult => canUseModuleWithKillSwitch(module, gatingContext),
      // Pass classified intent for module-specific logic
      intent: routeResult.intent,
    };
    
    // 12a. Check if takeaway conversational mode should be used
    // If any suggested module is takeaway-order and config has useConversationalMode=true
    let modulesToRun = routeResult.suggestedModules;
    
    if (modulesToRun.includes('takeaway-order') || modulesToRun.includes('order')) {
      const orgSettings = await prisma.orgSettings.findUnique({
        where: { orgId },
        select: { takeawayConfig: true },
      });
      const takeawayConfig = parseTakeawayConfig(orgSettings?.takeawayConfig);
      
      if (takeawayConfig.enabled && takeawayConfig.useConversationalMode) {
        // Replace takeaway-order with takeaway-conversational
        modulesToRun = modulesToRun.map(m => 
          (m === 'takeaway-order' || m === 'order') ? 'takeaway-conversational' : m
        );
        console.log('[engine] Using conversational mode for takeaway order');
      }
    }
    
    // 13. Run modules
    const moduleResult = await runModules(modulesToRun, moduleContext);
    
    // 14. Apply output policies
    const outputPolicyResult = applyOutputPolicies(moduleResult.responseText, { rules });
    const finalResponseText = outputPolicyResult.scrubbed || moduleResult.responseText;
    
    // 15. Adapt for channel
    const adaptedResponse = adaptForChannel(finalResponseText, channel);
    
    // 16. Determine final status
    const finalStatus = moduleResult.handoffTriggered 
      ? EngineRunStatus.handoff 
      : moduleResult.blockedBy 
        ? EngineRunStatus.blocked 
        : EngineRunStatus.success;
    
    // 17. Create engine run
    const run = await createEngineRun({
      orgId,                       // Phase 8: For rate limiting
      sessionId,
      agentTemplateId: context.template?.id,
      industryConfigId: context.org.industryConfig?.id,
      status: finalStatus,
      decision: {
        intent: routeResult.intent,
        confidence: routeResult.confidence,
        selectedModules: routeResult.suggestedModules,
      },
      modelUsed: provider.name,
      blockedBy: moduleResult.blockedBy,
      durationMs: Date.now() - startTime,
    });
    engineRunId = run.id;
    
    // 18. Save assistant turn
    await saveConversationTurn(sessionId, channel, 'assistant', adaptedResponse.formattedText);
    
    // 19. Update session metadata if needed
    if (moduleResult.sessionMetadataUpdates) {
      await updateSessionMetadata(sessionId, moduleResult.sessionMetadataUpdates);
    }
    
    // 20. Log audit
    await logEngineAudit('engine.run_completed', {
      intent: routeResult.intent,
      confidence: routeResult.confidence,
      status: finalStatus,
      durationMs: Date.now() - startTime,
    }, { orgId, sessionId });
    
    return {
      responseText: adaptedResponse.formattedText,
      sessionId,
      handoffTriggered: moduleResult.handoffTriggered,
      handoffReason: moduleResult.handoffReason,
      blocked: !!moduleResult.blockedBy,
      blockedBy: moduleResult.blockedBy,
      engineRunId,
    };
    
  } catch (error) {
    console.error('[engine] Error processing message:', error);
    
    // Create error run
    const run = await createEngineRun({
      orgId,                       // Phase 8: For rate limiting
      sessionId: sessionId || '',
      status: EngineRunStatus.error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      modelUsed: 'none',
      durationMs: Date.now() - startTime,
    });
    
    await logEngineAudit('engine.error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { orgId, sessionId: sessionId || undefined });
    
    return {
      responseText: adaptForChannel(FALLBACK_RESPONSES.error, channel).formattedText,
      sessionId: sessionId || '',
      handoffTriggered: true,
      handoffReason: 'Engine error',
      blocked: false,
      engineRunId: run.id,
    };
  }
}

// ============================================================================
// Voice-specific Entry Point
// ============================================================================

/**
 * Handle inbound call greeting
 * Returns welcome text for TTS (no full conversation in Phase 6)
 */
export async function handleInboundCallGreeting(
  orgId: string,
  from: string
): Promise<{ welcomeText: string; sessionId?: string }> {
  try {
    // Load context
    const context = await loadEngineContext(orgId);
    
    if (!context) {
      return { welcomeText: 'Thank you for calling. Please hold while we connect you.' };
    }
    
    // Get or create session for tracking
    const session = await getOrCreateSession(orgId, 'voice', normalizePhone(from));
    
    // Get template greeting if available
    const rules = context.template?.definition 
      ? parseTemplateRules(context.template.definition)
      : getDefaultRules();
    
    // Use org greeting or generate one
    const provider = getOpenAIProvider();
    
    if (provider.isConfigured() && context.template?.systemPrompt) {
      try {
        // Phase 8: Check budget BEFORE calling LLM (BLOQUANT 2)
        await requireAiBudget(orgId, 0.01); // Estimated cost for greeting
        
        const response = await provider.generateResponse({
          systemPrompt: context.template.systemPrompt,
          conversationHistory: [],
          userText: 'Generate a brief, friendly greeting for an incoming phone call. Keep it under 30 words.',
          maxOutputTokens: 60,
        });
        
        // Phase 8: Record actual cost
        const costUsd = estimateCostFromTokens(response.inputTokens, response.outputTokens, response.modelUsed);
        await recordAiCost(orgId, costUsd, response.inputTokens, response.outputTokens);
        
        const policyResult = applyOutputPolicies(response.text, { rules });
        const greeting = policyResult.scrubbed || response.text;
        
        // Log run
        await createEngineRun({
          orgId,                       // Phase 8: For rate limiting
          sessionId: session.id,
          agentTemplateId: context.template.id,
          status: EngineRunStatus.success,
          decision: { type: 'voice_greeting' },
          modelUsed: provider.name,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          costUsd,
        });
        
        return { welcomeText: greeting, sessionId: session.id };
        
      } catch (error) {
        console.error('[engine] Error generating voice greeting:', error);
      }
    }
    
    // Fallback greeting
    return { 
      welcomeText: 'Thank you for calling. Please hold while we connect you.',
      sessionId: session.id,
    };
    
  } catch (error) {
    console.error('[engine] Error in voice greeting:', error);
    return { welcomeText: 'Thank you for calling. Please hold while we connect you.' };
  }
}
