/**
 * Script to setup menu configuration for testing takeaway orders
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SAMPLE_MENU = {
  enabled: true,
  version: '1.0.0',
  currency: 'AUD',
  pricingMode: 'menu',
  allowOffMenuItems: false,
  itemNotFoundMessage: "Sorry, I couldn't find that on our menu. Would you like me to tell you what we have?",
  categories: [
    { id: 'mains', name: 'Main Courses', available: true, sortOrder: 1 },
    { id: 'sides', name: 'Sides', available: true, sortOrder: 2 },
    { id: 'drinks', name: 'Drinks', available: true, sortOrder: 3 },
  ],
  items: [
    {
      id: 'burger',
      name: 'Classic Burger',
      description: 'Beef patty with lettuce, tomato, and special sauce',
      priceCents: 1850,
      categoryId: 'mains',
      available: true,
      keywords: ['hamburger', 'beef burger', 'cheeseburger', 'burger'],
    },
    {
      id: 'fish-chips',
      name: 'Fish and Chips',
      description: 'Beer-battered fish with crispy chips',
      priceCents: 2200,
      categoryId: 'mains',
      available: true,
      keywords: ['fish', 'chips', 'fish & chips', 'battered fish'],
    },
    {
      id: 'chicken-parma',
      name: 'Chicken Parmigiana',
      description: 'Crumbed chicken with ham, cheese, and napoli sauce',
      priceCents: 2400,
      categoryId: 'mains',
      available: true,
      keywords: ['parma', 'parmi', 'chicken parmi', 'parmigiana'],
    },
    {
      id: 'pizza',
      name: 'Margherita Pizza',
      description: 'Classic tomato, mozzarella, and basil',
      priceCents: 1900,
      categoryId: 'mains',
      available: true,
      keywords: ['pizza', 'margherita', 'margarita'],
    },
    {
      id: 'chips',
      name: 'Chips',
      description: 'Crispy golden chips',
      priceCents: 800,
      categoryId: 'sides',
      available: true,
      keywords: ['fries', 'french fries', 'hot chips'],
    },
    {
      id: 'salad',
      name: 'Garden Salad',
      description: 'Fresh mixed leaves with house dressing',
      priceCents: 950,
      categoryId: 'sides',
      available: true,
      keywords: ['green salad', 'side salad'],
    },
    {
      id: 'coke',
      name: 'Coca-Cola',
      description: 'Classic Coca-Cola',
      priceCents: 450,
      categoryId: 'drinks',
      available: true,
      keywords: ['coke', 'cola', 'soft drink'],
    },
    {
      id: 'water',
      name: 'Bottled Water',
      description: 'Still water',
      priceCents: 350,
      categoryId: 'drinks',
      available: true,
      keywords: ['water', 'mineral water'],
    },
  ],
};

async function main() {
  console.log('=== MENU SETUP ===\n');

  // Find org
  const org = await prisma.org.findFirst({
    include: { settings: true },
  });

  if (!org) {
    console.log('❌ No org found. Run check-db.ts first.');
    return;
  }

  // Get channel endpoints (phone numbers)
  const endpoints = await prisma.channelEndpoint.findMany({
    where: { orgId: org.id },
  });

  console.log('📍 Organisation:', org.name);
  console.log('📞 Endpoints:', endpoints.map(e => e.twilioPhoneNumber || e.channel).join(', ') || 'None');
  console.log('💳 Stripe Account:', org.stripeAccountId || 'Not connected');
  console.log('');

  // Check current settings
  if (!org.settings) {
    console.log('❌ No settings found. Creating...');
    await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        menuConfig: SAMPLE_MENU,
        takeawayConfig: {
          enabled: true,
          requirePhone: true,
          requireName: true,
          requirePickupTime: false,
          maxItems: 20,
          maxClarificationQuestions: 3,
          defaultPickupMode: 'pickup',
          requireExplicitConfirmation: true,
        },
        takeawayPaymentConfig: {
          enabled: true,
          required: true,
          provider: 'stripe',
          acceptedMethods: ['card'],
          expirationMinutes: 30,
          maxRetries: 3,
        },
      },
    });
    console.log('✅ Created settings with menu');
  } else {
    // Update existing settings
    await prisma.orgSettings.update({
      where: { id: org.settings.id },
      data: {
        menuConfig: SAMPLE_MENU,
        takeawayConfig: org.settings.takeawayConfig || {
          enabled: true,
          requirePhone: true,
          requireName: true,
          requirePickupTime: false,
          maxItems: 20,
          maxClarificationQuestions: 3,
          defaultPickupMode: 'pickup',
          requireExplicitConfirmation: true,
        },
        takeawayPaymentConfig: org.settings.takeawayPaymentConfig || {
          enabled: true,
          required: true,
          provider: 'stripe',
          acceptedMethods: ['card'],
          expirationMinutes: 30,
          maxRetries: 3,
        },
      },
    });
    console.log('✅ Updated settings with menu');
  }

  // Display menu
  console.log('\n🍽️  MENU CONFIGURED:\n');
  console.log('Categories:');
  for (const cat of SAMPLE_MENU.categories) {
    console.log(`  📁 ${cat.name}`);
    const items = SAMPLE_MENU.items.filter(i => i.categoryId === cat.id);
    for (const item of items) {
      console.log(`     • ${item.name} - $${(item.priceCents / 100).toFixed(2)}`);
    }
  }

  console.log('\n✅ Ready to test! Call your Twilio number and order items.');
  console.log('\nFlow:');
  console.log('  1. Call → Order items (e.g., "I want a burger and chips")');
  console.log('  2. Confirm → Receive SMS with payment link + order summary');
  console.log('  3. Pay → Click link and pay via Stripe');
  console.log('  4. Confirm → Receive SMS "Order confirmed and paid"');

  if (!org.stripeAccountId) {
    console.log('\n⚠️  WARNING: Stripe not connected! Payment links won\'t work.');
    console.log('   Connect Stripe via the dashboard first.');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
