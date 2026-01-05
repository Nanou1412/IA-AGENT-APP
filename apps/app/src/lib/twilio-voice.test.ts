/**
 * Twilio Voice Helpers - Unit Tests (Phase 5)
 * 
 * Tests for voice TwiML generation, helpers, and gating
 */

import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  safeTextToSay,
  generateVoiceTwiML,
  sayTwiML,
  hangupTwiML,
  pauseTwiML,
  enqueueTwiML,
  dialTwiML,
  generateDeniedCallTwiML,
  generateUnmappedCallTwiML,
  generateWelcomeWithQueueTwiML,
  generateWelcomeWithDialTwiML,
  generateNoHandoffTwiML,
  generateQueueWaitTwiML,
  getVoiceConfigFromSettings,
  DEFAULT_CALL_WELCOME_TEXT,
  DEFAULT_CALL_QUEUE_WAIT_TEXT,
  DEFAULT_CALL_DENY_TEXT,
  DEFAULT_NO_HANDOFF_TEXT,
  DEFAULT_UNMAPPED_CALL_TEXT,
} from '@/lib/twilio-voice';

// ============================================================================
// XML Escaping Tests
// ============================================================================

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(escapeXml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes less than and greater than', () => {
    expect(escapeXml('<hello>')).toBe('&lt;hello&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeXml('Say "Hello"')).toBe('Say &quot;Hello&quot;');
  });

  it('escapes apostrophes', () => {
    expect(escapeXml("It's working")).toBe('It&apos;s working');
  });

  it('handles multiple special characters', () => {
    expect(escapeXml('<test & "value">')).toBe('&lt;test &amp; &quot;value&quot;&gt;');
  });
});

describe('safeTextToSay', () => {
  it('removes excessive whitespace', () => {
    expect(safeTextToSay('Hello   world')).toBe('Hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(safeTextToSay('  Hello world  ')).toBe('Hello world');
  });

  it('escapes XML characters', () => {
    expect(safeTextToSay('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('removes control characters', () => {
    expect(safeTextToSay('Hello\x00World')).toBe('HelloWorld');
  });
});

// ============================================================================
// TwiML Generation Tests
// ============================================================================

describe('generateVoiceTwiML', () => {
  it('wraps content in Response tags', () => {
    const result = generateVoiceTwiML('<Say>Hello</Say>');
    expect(result).toBe('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Hello</Say></Response>');
  });

  it('handles empty content', () => {
    const result = generateVoiceTwiML('');
    expect(result).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
});

describe('sayTwiML', () => {
  it('generates Say with default Australian voice', () => {
    const result = sayTwiML('Hello world');
    expect(result).toContain('<Say voice="Polly.Olivia" language="en-AU">Hello world</Say>');
  });

  it('escapes message content', () => {
    const result = sayTwiML('Tom & Jerry');
    expect(result).toContain('Tom &amp; Jerry');
  });

  it('uses custom voice when provided', () => {
    const result = sayTwiML('Hello', { voice: 'Polly.Nicole', language: 'en-AU' });
    expect(result).toContain('voice="Polly.Nicole"');
  });
});

describe('hangupTwiML', () => {
  it('generates Hangup tag', () => {
    expect(hangupTwiML()).toBe('<Hangup/>');
  });
});

describe('pauseTwiML', () => {
  it('generates Pause with default 1 second', () => {
    expect(pauseTwiML()).toBe('<Pause length="1"/>');
  });

  it('generates Pause with custom seconds', () => {
    expect(pauseTwiML(5)).toBe('<Pause length="5"/>');
  });
});

describe('enqueueTwiML', () => {
  it('generates Enqueue with queue name and waitUrl', () => {
    const result = enqueueTwiML('test_queue', '/wait');
    expect(result).toContain('<Enqueue waitUrl="/wait">test_queue</Enqueue>');
  });

  it('escapes queue name', () => {
    const result = enqueueTwiML('org_<test>', '/wait');
    expect(result).toContain('org_&lt;test&gt;');
  });

  it('includes action URL when provided', () => {
    const result = enqueueTwiML('test_queue', '/wait', { action: '/action' });
    expect(result).toContain('action="/action"');
  });
});

describe('dialTwiML', () => {
  it('generates Dial with number', () => {
    const result = dialTwiML('+61412345678');
    expect(result).toContain('<Dial><Number>+61412345678</Number></Dial>');
  });

  it('includes record attribute when enabled', () => {
    const result = dialTwiML('+61412345678', { record: 'record-from-answer' });
    expect(result).toContain('record="record-from-answer"');
  });

  it('includes timeout attribute', () => {
    const result = dialTwiML('+61412345678', { timeout: 30 });
    expect(result).toContain('timeout="30"');
  });

  it('includes callerId', () => {
    const result = dialTwiML('+61412345678', { callerId: '+61400000000' });
    expect(result).toContain('callerId="+61400000000"');
  });
});

// ============================================================================
// Call Flow TwiML Tests
// ============================================================================

describe('generateDeniedCallTwiML', () => {
  it('generates Say + Hangup', () => {
    const result = generateDeniedCallTwiML('Access denied');
    expect(result).toContain('<Say');
    expect(result).toContain('Access denied');
    expect(result).toContain('<Hangup/>');
  });

  it('wraps in Response', () => {
    const result = generateDeniedCallTwiML('Test');
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain('<Response>');
    expect(result).toContain('</Response>');
  });
});

describe('generateUnmappedCallTwiML', () => {
  it('uses default unmapped text', () => {
    const result = generateUnmappedCallTwiML();
    expect(result).toContain(DEFAULT_UNMAPPED_CALL_TEXT.split(' ')[0]); // First word
    expect(result).toContain('<Hangup/>');
  });

  it('accepts custom text', () => {
    const result = generateUnmappedCallTwiML('Custom message');
    expect(result).toContain('Custom message');
  });
});

describe('generateWelcomeWithQueueTwiML', () => {
  it('contains welcome message and Enqueue', () => {
    const result = generateWelcomeWithQueueTwiML('org123', 'Welcome!', '/wait?orgId=org123');
    expect(result).toContain('Welcome!');
    expect(result).toContain('<Enqueue');
    expect(result).toContain('waitUrl="/wait?orgId=org123"');
    expect(result).toContain('org_org123');
  });
});

describe('generateWelcomeWithDialTwiML', () => {
  it('contains welcome message and Dial', () => {
    const result = generateWelcomeWithDialTwiML('Welcome!', '+61412345678');
    expect(result).toContain('Welcome!');
    expect(result).toContain('<Dial');
    expect(result).toContain('+61412345678');
  });

  it('includes recording when enabled', () => {
    const result = generateWelcomeWithDialTwiML('Welcome!', '+61412345678', { record: true });
    expect(result).toContain('record="record-from-answer"');
  });

  it('includes callerId when provided', () => {
    const result = generateWelcomeWithDialTwiML('Welcome!', '+61412345678', { callerId: '+61400000000' });
    expect(result).toContain('callerId="+61400000000"');
  });
});

describe('generateNoHandoffTwiML', () => {
  it('contains welcome and fallback message with hangup', () => {
    const result = generateNoHandoffTwiML('Welcome!', 'We will call you back.');
    expect(result).toContain('Welcome!');
    expect(result).toContain('We will call you back');
    expect(result).toContain('<Hangup/>');
  });

  it('uses default fallback when not provided', () => {
    const result = generateNoHandoffTwiML('Welcome!');
    expect(result).toContain('Welcome!');
    expect(result).toContain(DEFAULT_NO_HANDOFF_TEXT.split(' ')[0]); // First word
  });
});

describe('generateQueueWaitTwiML', () => {
  it('contains wait message and pause', () => {
    const result = generateQueueWaitTwiML('Please hold...', 10);
    expect(result).toContain('Please hold...');
    expect(result).toContain('<Pause length="10"/>');
  });
});

// ============================================================================
// Voice Config Tests
// ============================================================================

describe('getVoiceConfigFromSettings', () => {
  it('returns defaults when settings is null', () => {
    const config = getVoiceConfigFromSettings(null);
    expect(config.voiceEnabled).toBe(false);
    expect(config.callQueueEnabled).toBe(true);
    expect(config.callWelcomeText).toBe(DEFAULT_CALL_WELCOME_TEXT);
    expect(config.callQueueWaitText).toBe(DEFAULT_CALL_QUEUE_WAIT_TEXT);
    expect(config.callDenyText).toBe(DEFAULT_CALL_DENY_TEXT);
    expect(config.callHandoffNumber).toBe(null);
    expect(config.recordCalls).toBe(false);
  });

  it('returns settings values when provided', () => {
    const config = getVoiceConfigFromSettings({
      voiceEnabled: true,
      callQueueEnabled: false,
      callWelcomeText: 'Custom welcome',
      callQueueWaitText: 'Custom wait',
      callDenyText: 'Custom deny',
      callHandoffNumber: '+61412345678',
      recordCalls: true,
    });
    expect(config.voiceEnabled).toBe(true);
    expect(config.callQueueEnabled).toBe(false);
    expect(config.callWelcomeText).toBe('Custom welcome');
    expect(config.callQueueWaitText).toBe('Custom wait');
    expect(config.callDenyText).toBe('Custom deny');
    expect(config.callHandoffNumber).toBe('+61412345678');
    expect(config.recordCalls).toBe(true);
  });

  it('falls back to defaults for null text fields', () => {
    const config = getVoiceConfigFromSettings({
      voiceEnabled: true,
      callWelcomeText: null,
      callQueueWaitText: null,
      callDenyText: null,
    });
    expect(config.callWelcomeText).toBe(DEFAULT_CALL_WELCOME_TEXT);
    expect(config.callQueueWaitText).toBe(DEFAULT_CALL_QUEUE_WAIT_TEXT);
    expect(config.callDenyText).toBe(DEFAULT_CALL_DENY_TEXT);
  });
});

// ============================================================================
// Default Messages Tests (EN - AU target)
// ============================================================================

describe('Default Voice Messages', () => {
  it('default welcome text is in English', () => {
    expect(DEFAULT_CALL_WELCOME_TEXT).toContain('Thanks for calling');
  });

  it('default queue wait text is in English', () => {
    expect(DEFAULT_CALL_QUEUE_WAIT_TEXT).toContain('Thank you');
  });

  it('default deny text is in English', () => {
    expect(DEFAULT_CALL_DENY_TEXT).toContain('sorry');
  });

  it('default no handoff text is in English', () => {
    expect(DEFAULT_NO_HANDOFF_TEXT).toContain('call you back');
  });

  it('default unmapped text is in English', () => {
    expect(DEFAULT_UNMAPPED_CALL_TEXT).toContain('not configured');
  });
});
