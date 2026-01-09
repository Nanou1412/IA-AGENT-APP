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
  return `Tu es un assistant virtuel pour un restaurant. Tu aides les clients à passer leurs commandes de plats à emporter.

RÈGLES IMPORTANTES:
1. Sois poli, professionnel et concis
2. Aide les clients à choisir des plats du menu
3. Confirme toujours les détails de la commande avant de finaliser
4. Si le client demande quelque chose hors de ta portée, propose un transfert vers un humain

CAPACITÉS:
- Prendre des commandes de plats à emporter
- Répondre aux questions sur le menu
- Envoyer des liens de paiement par SMS
- Fournir des confirmations de commande

MENU DISPONIBLE:
Tu as accès au menu configuré pour ce restaurant. Utilise les prix et articles définis.

FLUX DE COMMANDE:
1. Accueille le client
2. Prends note des articles souhaités
3. Récapitule la commande avec les prix
4. Demande le numéro de téléphone pour le SMS de paiement
5. Envoie le lien de paiement
6. Confirme la commande une fois le paiement reçu`;
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
    'parler à quelqu\'un',
    'un humain',
    'manager',
    'complaint',
    'plainte',
    'problème grave',
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
        examples: ['Bonjour', 'Hello', 'Hi', 'Salut'],
      },
      'order.start': {
        description: 'Customer wants to start ordering',
        examples: ['Je voudrais commander', 'I want to order', 'Je veux passer une commande'],
      },
      'order.add_items': {
        description: 'Customer wants to add items to order',
        examples: ['Je veux un burger', 'Add a pizza', 'Je prends des frites'],
      },
      'menu.inquiry': {
        description: 'Customer asks about the menu',
        examples: ['Qu\'est-ce que vous avez?', 'What do you have?', 'Le menu svp'],
      },
      'payment.request': {
        description: 'Customer is ready to pay',
        examples: ['Je veux payer', 'Send me the payment link', 'Comment je paie?'],
      },
      'handoff': {
        description: 'Customer wants to speak with a human',
        examples: ['Parler à quelqu\'un', 'Human please', 'Je veux un manager'],
      },
    },
  };
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
