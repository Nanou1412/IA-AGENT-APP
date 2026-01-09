/**
 * Enable Conversational Mode for Demo Restaurant
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function enableConversationalMode() {
  const orgId = 'cmk5rtmi9000267bmjc3chqw9'; // Demo Restaurant

  // Get current config
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: { takeawayConfig: true },
  });

  const currentConfig = (settings?.takeawayConfig as object) || {};

  // Update with conversational mode enabled
  const updatedConfig = {
    ...currentConfig,
    enabled: true,
    useConversationalMode: true,
  };

  await prisma.orgSettings.update({
    where: { orgId },
    data: {
      takeawayConfig: updatedConfig,
    },
  });

  console.log('✅ Conversational mode enabled for Demo Restaurant');
  console.log('Updated config:', JSON.stringify(updatedConfig, null, 2));
}

enableConversationalMode()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
