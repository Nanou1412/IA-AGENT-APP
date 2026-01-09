import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Creating takeaway restaurant template...\n');

  // 1. Create the template
  const template = await prisma.agentTemplate.upsert({
    where: {
      slug_version: {
        slug: 'restaurant-takeaway',
        version: '1.0.0',
      },
    },
    update: {
      systemPrompt: getSystemPrompt(),
      intentsAllowed: getIntentsAllowed(),
      modulesDefault: getModulesDefault(),
      handoffTriggers: getHandoffTriggers(),
      definition: getDefinition(),
    },
    create: {
      slug: 'restaurant-takeaway',
      version: '1.0.0',
      title: 'Restaurant Takeaway Agent',
      systemPrompt: getSystemPrompt(),
      intentsAllowed: getIntentsAllowed(),
      modulesDefault: getModulesDefault(),
      handoffTriggers: getHandoffTriggers(),
      settingsSchema: {},
      definition: getDefinition(),
    },
  });

  console.log('✅ Template created:', template.slug, template.version);
  console.log('   ID:', template.id);

  // 2. Get the org
  const org = await prisma.org.findFirst();
  
  if (!org) {
    console.log('❌ No org found');
    return;
  }

  console.log('\n📋 Assigning template to org:', org.name);

  // 3. Create the assignment
  const assignment = await prisma.agentAssignment.upsert({
    where: {
      id: 'default-assignment', // Placeholder, will create if not exists
    },
    update: {
      templateId: template.id,
      templateVersion: template.version,
      status: 'active',
    },
    create: {
      orgId: org.id,
      templateId: template.id,
      templateVersion: template.version,
      status: 'active',
    },
  });

  console.log('✅ Assignment created:', assignment.id);
  console.log('   Status:', assignment.status);

  // 4. Update industry config with default template
  await prisma.industryConfig.update({
    where: { id: org.industryConfigId! },
    data: {
      defaultTemplateSlug: 'restaurant-takeaway',
      defaultTemplateVersion: '1.0.0',
    },
  });

  console.log('\n✅ Industry config updated with default template');
  
  console.log('\n🎉 Setup complete! Voice AI should now work.');
}

function getSystemPrompt(): string {
  return `You are a virtual assistant for a restaurant. You help customers place their takeaway orders.

IMPORTANT RULES:
1. Be polite, professional, and concise
2. Help customers choose dishes from the menu
3. Always confirm order details before finalizing
4. If the customer asks for something outside your scope, offer to transfer to a human

CAPABILITIES:
- Take takeaway orders
- Answer questions about the menu
- Send payment links via SMS
- Provide order confirmations

AVAILABLE MENU:
You have access to the configured menu for this restaurant. Use the defined prices and items.

ORDER FLOW:
1. Greet the customer
2. Take note of desired items
3. Summarize the order with prices
4. Ask for phone number for payment SMS
5. Send the payment link
6. Confirm the order once payment is received`;
}

function getIntentsAllowed(): string[] {
  return [
    'greeting',
    'order.start',
    'order.add_items',
    'order.remove_item',
    'order.modify',
    'order.confirm',
    'order.cancel',
    'order.status',
    'menu.inquiry',
    'menu.recommendation',
    'payment.request',
    'payment.status',
    'faq',
    'handoff',
    'goodbye',
  ];
}

function getModulesDefault(): string[] {
  return [
    'takeaway-order',
    'faq',
  ];
}

function getHandoffTriggers(): string[] {
  return [
    'speak to human',
    'talk to someone',
    'speak to a person',
    'real person',
    'manager',
    'complaint',
    'serious problem',
    'refund',
  ];
}

function getDefinition(): object {
  return {
    type: 'restaurant-takeaway',
    features: {
      voiceEnabled: true,
      smsEnabled: true,
      paymentEnabled: true,
      menuValidation: true,
    },
    intents: {
      'greeting': {
        description: 'Customer greeting or starting conversation',
        examples: ['Hello', 'Hi', 'Good morning', 'Hey there'],
      },
      'order.start': {
        description: 'Customer wants to start ordering',
        examples: ['I want to order', 'I would like to place an order', 'Can I order something'],
      },
      'order.add_items': {
        description: 'Customer wants to add items to order',
        examples: ['I want a burger', 'Add a pizza', 'I will take some fries', 'Give me a salad'],
      },
      'menu.inquiry': {
        description: 'Customer asks about the menu',
        examples: ['What do you have?', 'Show me the menu', 'What can I order?'],
      },
      'payment.request': {
        description: 'Customer is ready to pay',
        examples: ['I want to pay', 'Send me the payment link', 'How do I pay?'],
      },
      'handoff': {
        description: 'Customer wants to speak with a human',
        examples: ['Talk to someone', 'Human please', 'I want a manager'],
      },
    },
  };
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
