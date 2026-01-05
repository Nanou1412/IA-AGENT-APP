#!/usr/bin/env node
/**
 * Twilio Webhook Simulation Script
 * 
 * Simulates inbound SMS/WhatsApp messages for testing.
 * Usage: npx ts-node scripts/simulate-twilio-webhook.ts [sms|whatsapp] [phone] [message]
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface SimulateOptions {
  channel: 'sms' | 'whatsapp';
  from: string;
  to: string;
  body: string;
}

async function simulateInboundMessage(options: SimulateOptions) {
  const { channel, from, to, body } = options;
  
  const endpoint = channel === 'sms' 
    ? `${BASE_URL}/api/twilio/sms`
    : `${BASE_URL}/api/twilio/whatsapp`;
  
  // Build form data matching Twilio's format
  const formData = new URLSearchParams();
  formData.append('MessageSid', `SM_TEST_${Date.now()}`);
  formData.append('AccountSid', 'AC_TEST_ACCOUNT');
  formData.append('From', channel === 'whatsapp' ? `whatsapp:${from}` : from);
  formData.append('To', channel === 'whatsapp' ? `whatsapp:${to}` : to);
  formData.append('Body', body);
  formData.append('NumMedia', '0');
  formData.append('NumSegments', '1');
  formData.append('SmsStatus', 'received');
  formData.append('ApiVersion', '2010-04-01');
  
  if (channel === 'whatsapp') {
    formData.append('ProfileName', 'Test User');
    formData.append('WaId', from.replace('+', ''));
  }

  console.log(`\n📱 Simulating ${channel.toUpperCase()} inbound message...`);
  console.log(`   From: ${channel === 'whatsapp' ? 'whatsapp:' : ''}${from}`);
  console.log(`   To: ${channel === 'whatsapp' ? 'whatsapp:' : ''}${to}`);
  console.log(`   Body: ${body}`);
  console.log(`   Endpoint: ${endpoint}`);
  console.log('');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Note: No signature header - validation should be disabled in dev
      },
      body: formData.toString(),
    });

    const contentType = response.headers.get('content-type') || '';
    const responseText = await response.text();

    console.log(`📨 Response Status: ${response.status}`);
    console.log(`📨 Content-Type: ${contentType}`);
    console.log('📨 Response Body:');
    console.log(responseText);
    console.log('');

    // Parse TwiML response
    if (contentType.includes('text/xml')) {
      if (responseText.includes('<Message>')) {
        const match = responseText.match(/<Message>(.*?)<\/Message>/);
        if (match) {
          console.log(`✅ TwiML Reply: "${match[1]}"`);
        }
      } else if (responseText.includes('<Response></Response>')) {
        console.log('✅ Empty TwiML response (no auto-reply)');
      }
    }

    return { success: response.ok, status: response.status, body: responseText };
  } catch (error) {
    console.error('❌ Request failed:', error);
    return { success: false, error };
  }
}

async function simulateStatusCallback(messageSid: string, status: string) {
  const endpoint = `${BASE_URL}/api/twilio/status`;
  
  const formData = new URLSearchParams();
  formData.append('MessageSid', messageSid);
  formData.append('MessageStatus', status);
  formData.append('To', '+61400000000');
  formData.append('From', '+61412345678');
  
  if (status === 'failed' || status === 'undelivered') {
    formData.append('ErrorCode', '30008');
    formData.append('ErrorMessage', 'Unknown error');
  }

  console.log(`\n📊 Simulating status callback...`);
  console.log(`   MessageSid: ${messageSid}`);
  console.log(`   Status: ${status}`);
  console.log('');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    console.log(`📨 Response Status: ${response.status}`);
    return { success: response.ok, status: response.status };
  } catch (error) {
    console.error('❌ Request failed:', error);
    return { success: false, error };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  // Default test values
  let channel: 'sms' | 'whatsapp' = 'sms';
  let from = '+61400111222';  // Customer's number
  let to = '+61412345678';    // Your Twilio number (must match a ChannelEndpoint)
  let body = 'Hello, this is a test message!';
  
  // Parse command line arguments
  if (args[0] === 'sms' || args[0] === 'whatsapp') {
    channel = args[0];
    args.shift();
  }
  
  if (args[0] === 'status') {
    const messageSid = args[1] || `SM_TEST_${Date.now()}`;
    const status = args[2] || 'delivered';
    await simulateStatusCallback(messageSid, status);
    return;
  }
  
  if (args[0]) {
    from = args[0].startsWith('+') ? args[0] : `+${args[0]}`;
  }
  
  if (args[1]) {
    to = args[1].startsWith('+') ? args[1] : `+${args[1]}`;
  }
  
  if (args[2]) {
    body = args.slice(2).join(' ');
  }

  console.log('='.repeat(60));
  console.log('🧪 Twilio Webhook Simulator');
  console.log('='.repeat(60));
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/simulate-twilio-webhook.ts [sms|whatsapp] [from] [to] [message]');
  console.log('  npx ts-node scripts/simulate-twilio-webhook.ts status [messageSid] [status]');
  console.log('');
  console.log('Examples:');
  console.log('  npx ts-node scripts/simulate-twilio-webhook.ts sms +61400111222 +61412345678 Hello!');
  console.log('  npx ts-node scripts/simulate-twilio-webhook.ts whatsapp +61400111222 +61412345678 Hello!');
  console.log('  npx ts-node scripts/simulate-twilio-webhook.ts status SM123456 delivered');
  console.log('');

  await simulateInboundMessage({ channel, from, to, body });

  console.log('='.repeat(60));
  console.log('');
  console.log('💡 Tips:');
  console.log('   - Make sure the "to" number matches a ChannelEndpoint in the database');
  console.log('   - Disable signature validation in development (.env TWILIO_WEBHOOK_SIGNATURE_VALIDATION=false)');
  console.log('   - Check the server logs for detailed processing info');
  console.log('');
}

main().catch(console.error);
