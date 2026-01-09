/**
 * Enable test mode for payment - sends fake payment links for testing
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== ENABLE TEST PAYMENT MODE ===\n');

  const org = await prisma.org.findFirst();
  if (!org) {
    console.log('No org found');
    return;
  }

  await prisma.orgSettings.update({
    where: { orgId: org.id },
    data: {
      takeawayPaymentConfig: {
        enabled: true,
        mode: 'optional',
        testMode: true,
        methods: ['card'],
        timing: 'before_confirmation',
        expiryMinutes: 30,
        maxRetries: 3,
        platformFeePercent: 1,
        platformFeeFixed: 30,
        messages: {
          paymentRequired: 'Pour finaliser, vous recevrez un lien de paiement par SMS.',
          paymentLinkSent: 'Lien de paiement envoyé par SMS !',
          paymentSuccess: 'Paiement reçu ! Commande confirmée.',
          paymentExpired: 'Lien expiré. Voulez-vous un nouveau ?',
        },
      },
    },
  });

  console.log('✅ Payment config updated:');
  console.log('   - testMode: true (fake links)');
  console.log('   - mode: optional');
  console.log('\n📱 Tu recevras un SMS avec un faux lien de paiement pour tester.');

  await prisma.$disconnect();
}

main().catch(console.error);
