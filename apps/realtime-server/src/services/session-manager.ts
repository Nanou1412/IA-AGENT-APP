/**
 * Session Manager
 * 
 * Manages active voice sessions between Twilio and OpenAI
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { ServerConfig } from '../config.js';
import { OpenAIRealtimeClient } from './openai-client.js';
import { appApiClient } from './app-api-client.js';
import type { RealtimeTool } from '../types/openai-realtime.js';
import type { TwilioSessionContext } from '../types/twilio.js';
import WebSocket from 'ws';

const log = createLogger('session-manager');

// ============================================================================
// Session Types
// ============================================================================

export interface VoiceSession {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  
  // Twilio context
  twilioContext: TwilioSessionContext;
  twilioWs: WebSocket | null;
  
  // OpenAI client
  openaiClient: OpenAIRealtimeClient | null;
  
  // Order state (synced with main app)
  orderState: OrderState;
  
  // Org configuration (cached)
  orgConfig: OrgConfig | null;
}

export interface OrderState {
  items: OrderItem[];
  customerName: string | null;
  customerPhone: string | null;
  specialInstructions: string | null;
  pickupTime: string | null;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

export interface OrgConfig {
  orgId: string;
  orgName: string;
  systemPrompt: string;
  menu: MenuItem[];
  timezone: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
}

// ============================================================================
// Session Manager Class
// ============================================================================

export class SessionManager {
  private sessions = new Map<string, VoiceSession>();
  private config: ServerConfig;
  
  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  
  constructor(config: ServerConfig) {
    this.config = config;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 60 * 1000); // Every minute
  }
  
  /**
   * Create a new session
   */
  createSession(twilioContext: TwilioSessionContext): VoiceSession {
    const session: VoiceSession = {
      id: uuidv4(),
      createdAt: new Date(),
      lastActivityAt: new Date(),
      twilioContext,
      twilioWs: null,
      openaiClient: null,
      orderState: {
        items: [],
        customerName: null,
        customerPhone: twilioContext.from || null,
        specialInstructions: null,
        pickupTime: null,
      },
      orgConfig: null,
    };
    
    this.sessions.set(session.id, session);
    log.info('Session created', { 
      sessionId: session.id, 
      callSid: twilioContext.callSid,
      orgId: twilioContext.orgId,
    });
    
    return session;
  }
  
  /**
   * Get session by ID
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Get session by call SID
   */
  getSessionByCallSid(callSid: string): VoiceSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.twilioContext.callSid === callSid) {
        return session;
      }
    }
    return undefined;
  }
  
  /**
   * Get session by stream SID
   */
  getSessionByStreamSid(streamSid: string): VoiceSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.twilioContext.streamSid === streamSid) {
        return session;
      }
    }
    return undefined;
  }
  
  /**
   * Update session activity timestamp
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }
  
  /**
   * Initialize OpenAI connection for a session
   */
  async initializeOpenAI(session: VoiceSession): Promise<void> {
    if (!session.orgConfig) {
      throw new Error('Org config not loaded');
    }
    
    const tools = this.buildTools();
    const systemPrompt = this.buildSystemPrompt(session);
    
    session.openaiClient = new OpenAIRealtimeClient({
      serverConfig: this.config,
      sessionId: session.id,
      systemPrompt,
      tools,
      voice: 'alloy',
      
      onAudioDelta: (audioBase64) => {
        this.handleAudioFromOpenAI(session, audioBase64);
      },
      
      onTranscript: (transcript, isFinal) => {
        if (isFinal) {
          log.debug('AI said', { sessionId: session.id, transcript });
        }
      },
      
      onFunctionCall: async (name, args, callId) => {
        return this.handleFunctionCall(session, name, args, callId);
      },
      
      onError: (error) => {
        log.error('OpenAI error in session', { sessionId: session.id, error: error.message });
      },
      
      onClose: () => {
        log.info('OpenAI connection closed', { sessionId: session.id });
      },
    });
    
    await session.openaiClient.connect();
    log.info('OpenAI initialized for session', { sessionId: session.id });
  }
  
  /**
   * Build tools for the session
   */
  private buildTools(): RealtimeTool[] {
    return [
      {
        type: 'function',
        name: 'add_item',
        description: 'Add an item to the customer order. Use the exact menu item name.',
        parameters: {
          type: 'object',
          properties: {
            item_name: {
              type: 'string',
              description: 'The exact name of the menu item to add',
            },
            quantity: {
              type: 'number',
              description: 'Number of items to add (default 1)',
            },
            notes: {
              type: 'string',
              description: 'Special instructions for this item',
            },
          },
          required: ['item_name'],
        },
      },
      {
        type: 'function',
        name: 'remove_item',
        description: 'Remove an item from the order',
        parameters: {
          type: 'object',
          properties: {
            item_name: {
              type: 'string',
              description: 'The name of the item to remove',
            },
          },
          required: ['item_name'],
        },
      },
      {
        type: 'function',
        name: 'set_customer_name',
        description: 'Set the customer name for the order',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The customer name',
            },
          },
          required: ['name'],
        },
      },
      {
        type: 'function',
        name: 'set_pickup_time',
        description: 'Set the pickup time for the order',
        parameters: {
          type: 'object',
          properties: {
            time: {
              type: 'string',
              description: 'The pickup time (e.g., "6:30 PM", "in 30 minutes")',
            },
          },
          required: ['time'],
        },
      },
      {
        type: 'function',
        name: 'get_order_summary',
        description: 'Get the current order summary to read to the customer',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        type: 'function',
        name: 'confirm_order',
        description: 'Confirm and submit the order',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }
  
  /**
   * Build system prompt for the session
   */
  private buildSystemPrompt(session: VoiceSession): string {
    const { orgConfig, orderState } = session;
    if (!orgConfig) return '';
    
    // Format menu
    const menuText = orgConfig.menu
      .map(item => `${item.name}: $${item.price.toFixed(2)}`)
      .join(', ');
    
    // Format current order
    let orderText = 'Empty';
    if (orderState.items.length > 0) {
      orderText = orderState.items
        .map(item => `${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})`)
        .join(', ');
    }
    
    return `You are a phone order assistant for ${orgConfig.orgName}.

MENU: ${menuText}

CURRENT ORDER: ${orderText}
${orderState.customerName ? `Customer: ${orderState.customerName}` : 'Customer name: Not set (ask for it before confirming)'}

RULES:
- Keep responses SHORT (1-2 sentences max) - this is a phone call
- Only offer items from the menu
- Use functions to modify the order
- Ask for customer name before confirming the order
- Be friendly but efficient

${orgConfig.systemPrompt || ''}`;
  }
  
  /**
   * Handle audio coming from OpenAI
   */
  private handleAudioFromOpenAI(session: VoiceSession, audioBase64: string): void {
    if (!session.twilioWs || session.twilioWs.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Note: Audio conversion (PCM16 24kHz → mulaw 8kHz) should happen here
    // For now, OpenAI supports g711_ulaw directly, so we can configure that
    
    const message = {
      event: 'media',
      streamSid: session.twilioContext.streamSid,
      media: {
        payload: audioBase64,
      },
    };
    
    session.twilioWs.send(JSON.stringify(message));
  }
  
  /**
   * Handle function calls from OpenAI
   */
  private async handleFunctionCall(
    session: VoiceSession,
    name: string,
    args: Record<string, unknown>,
    callId: string
  ): Promise<string> {
    log.info('Handling function call', { sessionId: session.id, callId, name, args });
    
    switch (name) {
      case 'add_item':
        return this.handleAddItem(session, args);
        
      case 'remove_item':
        return this.handleRemoveItem(session, args);
        
      case 'set_customer_name':
        return this.handleSetCustomerName(session, args);
        
      case 'set_pickup_time':
        return this.handleSetPickupTime(session, args);
        
      case 'get_order_summary':
        return this.handleGetOrderSummary(session);
        
      case 'confirm_order':
        return this.handleConfirmOrder(session);
        
      default:
        return JSON.stringify({ error: `Unknown function: ${name}` });
    }
  }
  
  private handleAddItem(session: VoiceSession, args: Record<string, unknown>): string {
    const itemName = args.item_name as string;
    const quantity = (args.quantity as number) || 1;
    const notes = args.notes as string | undefined;
    
    if (!session.orgConfig) {
      return JSON.stringify({ error: 'Menu not loaded' });
    }
    
    // Find item in menu (fuzzy match)
    const menuItem = session.orgConfig.menu.find(
      item => item.name.toLowerCase().includes(itemName.toLowerCase()) ||
              itemName.toLowerCase().includes(item.name.toLowerCase())
    );
    
    if (!menuItem) {
      return JSON.stringify({ 
        success: false, 
        message: `Item "${itemName}" not found on menu`,
      });
    }
    
    // Add to order
    const orderItem: OrderItem = {
      id: uuidv4(),
      name: menuItem.name,
      quantity,
      price: menuItem.price,
      notes,
    };
    
    session.orderState.items.push(orderItem);
    this.touchSession(session.id);
    
    return JSON.stringify({
      success: true,
      message: `Added ${quantity}x ${menuItem.name} ($${(menuItem.price * quantity).toFixed(2)}) to order`,
      orderTotal: this.calculateOrderTotal(session),
    });
  }
  
  private handleRemoveItem(session: VoiceSession, args: Record<string, unknown>): string {
    const itemName = args.item_name as string;
    
    const index = session.orderState.items.findIndex(
      item => item.name.toLowerCase().includes(itemName.toLowerCase())
    );
    
    if (index === -1) {
      return JSON.stringify({
        success: false,
        message: `Item "${itemName}" not found in order`,
      });
    }
    
    const removed = session.orderState.items.splice(index, 1)[0];
    this.touchSession(session.id);
    
    return JSON.stringify({
      success: true,
      message: `Removed ${removed.name} from order`,
      orderTotal: this.calculateOrderTotal(session),
    });
  }
  
  private handleSetCustomerName(session: VoiceSession, args: Record<string, unknown>): string {
    const name = args.name as string;
    session.orderState.customerName = name;
    this.touchSession(session.id);
    
    return JSON.stringify({
      success: true,
      message: `Customer name set to ${name}`,
    });
  }
  
  private handleSetPickupTime(session: VoiceSession, args: Record<string, unknown>): string {
    const time = args.time as string;
    session.orderState.pickupTime = time;
    this.touchSession(session.id);
    
    return JSON.stringify({
      success: true,
      message: `Pickup time set to ${time}`,
    });
  }
  
  private handleGetOrderSummary(session: VoiceSession): string {
    const { items, customerName, pickupTime } = session.orderState;
    
    if (items.length === 0) {
      return JSON.stringify({
        message: 'The order is empty',
        total: 0,
      });
    }
    
    const itemsSummary = items.map(
      item => `${item.quantity}x ${item.name} at $${(item.price * item.quantity).toFixed(2)}`
    ).join(', ');
    
    return JSON.stringify({
      items: itemsSummary,
      customerName: customerName || 'Not set',
      pickupTime: pickupTime || 'As soon as possible',
      total: this.calculateOrderTotal(session),
    });
  }
  
  private async handleConfirmOrder(session: VoiceSession): Promise<string> {
    const { items, customerName, customerPhone, pickupTime, specialInstructions } = session.orderState;
    
    if (items.length === 0) {
      return JSON.stringify({
        success: false,
        message: 'Cannot confirm empty order',
      });
    }
    
    if (!customerName) {
      return JSON.stringify({
        success: false,
        message: 'Please get the customer name before confirming',
      });
    }
    
    const totalAmount = this.calculateOrderTotal(session);
    
    // Submit order to main app via API
    const result = await appApiClient.submitOrder({
      orgId: session.twilioContext.orgId,
      sessionId: session.id,
      customerName,
      customerPhone: customerPhone || session.twilioContext.from,
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes,
      })),
      pickupTime: pickupTime || undefined,
      specialInstructions: specialInstructions || undefined,
      totalAmount,
      channel: 'voice',
    });
    
    if (!result.success) {
      log.error('Order submission failed', {
        sessionId: session.id,
        error: result.error,
      });
      
      return JSON.stringify({
        success: false,
        message: 'Sorry, there was a problem submitting your order. Please try again.',
      });
    }
    
    log.info('Order confirmed and submitted', {
      sessionId: session.id,
      orgId: session.twilioContext.orgId,
      orderId: result.orderId,
      customerName,
      items: items.map(i => ({ name: i.name, qty: i.quantity })),
      total: totalAmount,
    });
    
    return JSON.stringify({
      success: true,
      message: `Order confirmed for ${customerName}. Total: $${totalAmount.toFixed(2)}. Your order ID is ${result.orderId?.slice(-6).toUpperCase() || 'pending'}.`,
      orderId: result.orderId,
    });
  }
  
  private calculateOrderTotal(session: VoiceSession): number {
    return session.orderState.items.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  }
  
  /**
   * Close a session
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    if (session.openaiClient) {
      session.openaiClient.close();
    }
    
    if (session.twilioWs && session.twilioWs.readyState === WebSocket.OPEN) {
      session.twilioWs.close();
    }
    
    this.sessions.delete(sessionId);
    log.info('Session closed', { sessionId });
  }
  
  /**
   * Clean up stale sessions
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions) {
      const age = now - session.lastActivityAt.getTime();
      if (age > this.SESSION_TIMEOUT_MS) {
        log.info('Cleaning up stale session', { sessionId, ageMinutes: age / 60000 });
        this.closeSession(sessionId);
      }
    }
  }
  
  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
  
  /**
   * Shutdown the session manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }
}
