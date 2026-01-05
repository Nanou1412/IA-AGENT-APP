/**
 * Channel Adapters Tests
 */

import { describe, it, expect } from 'vitest';
import {
  adaptForSMS,
  adaptForWhatsApp,
  adaptForVoice,
  adaptForChannel,
} from '../adapters';

describe('adaptForSMS', () => {
  it('should return unchanged text for short messages', () => {
    const text = 'Hello, how can I help you?';
    const result = adaptForSMS(text);
    
    expect(result.formattedText).toBe(text);
    expect(result.truncated).toBe(false);
  });

  it('should strip markdown formatting', () => {
    const text = 'This is **bold** and _italic_ text.';
    const result = adaptForSMS(text);
    
    expect(result.formattedText).toBe('This is bold and italic text.');
  });

  it('should strip code blocks', () => {
    const text = 'Here is some code: ```const x = 1;``` and inline `code`.';
    const result = adaptForSMS(text);
    
    expect(result.formattedText).not.toContain('```');
    expect(result.formattedText).not.toContain('`');
  });

  it('should strip links but keep text', () => {
    const text = 'Check out [our website](https://example.com) for more info.';
    const result = adaptForSMS(text);
    
    expect(result.formattedText).toBe('Check out our website for more info.');
  });

  it('should truncate very long messages', () => {
    const text = 'A'.repeat(2000);
    const result = adaptForSMS(text);
    
    expect(result.truncated).toBe(true);
    expect(result.formattedText.length).toBeLessThanOrEqual(1600);
  });
});

describe('adaptForWhatsApp', () => {
  it('should convert markdown bold to WhatsApp format', () => {
    const text = 'This is **bold** text.';
    const result = adaptForWhatsApp(text);
    
    expect(result.formattedText).toBe('This is *bold* text.');
  });

  it('should keep italic formatting', () => {
    const text = 'This is _italic_ text.';
    const result = adaptForWhatsApp(text);
    
    expect(result.formattedText).toBe('This is _italic_ text.');
  });

  it('should handle longer messages than SMS', () => {
    const text = 'A'.repeat(3000);
    const result = adaptForWhatsApp(text);
    
    expect(result.truncated).toBe(false);
  });

  it('should truncate messages over 4096 chars', () => {
    const text = 'A'.repeat(5000);
    const result = adaptForWhatsApp(text);
    
    expect(result.truncated).toBe(true);
    expect(result.formattedText.length).toBeLessThanOrEqual(4096);
  });
});

describe('adaptForVoice', () => {
  it('should strip formatting for TTS', () => {
    const text = 'This is **bold** and _italic_.';
    const result = adaptForVoice(text);
    
    expect(result.formattedText).toBe('This is bold and italic.');
  });

  it('should expand common abbreviations', () => {
    const text = 'Contact Dr. Smith at 123 Main St.';
    const result = adaptForVoice(text);
    
    expect(result.formattedText).toContain('doctor');
    expect(result.formattedText).toContain('street');
  });

  it('should remove special characters', () => {
    const text = 'Use #hashtag and @mention with & symbol.';
    const result = adaptForVoice(text);
    
    expect(result.formattedText).not.toContain('#');
    expect(result.formattedText).not.toContain('@');
    expect(result.formattedText).not.toContain('&');
  });

  it('should normalize whitespace', () => {
    const text = 'Multiple   spaces    here.';
    const result = adaptForVoice(text);
    
    expect(result.formattedText).toBe('Multiple spaces here.');
  });
});

describe('adaptForChannel', () => {
  it('should route to SMS adapter', () => {
    const result = adaptForChannel('**Bold text**', 'sms');
    expect(result.formattedText).toBe('Bold text');
  });

  it('should route to WhatsApp adapter', () => {
    const result = adaptForChannel('**Bold text**', 'whatsapp');
    expect(result.formattedText).toBe('*Bold text*');
  });

  it('should route to Voice adapter', () => {
    const result = adaptForChannel('**Bold text**', 'voice');
    expect(result.formattedText).toBe('Bold text');
  });

  it('should report original length', () => {
    const text = 'Hello world';
    const result = adaptForChannel(text, 'sms');
    expect(result.originalLength).toBe(text.length);
  });
});
