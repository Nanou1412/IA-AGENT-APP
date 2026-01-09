/**
 * Add takeaway module to restaurant industry config
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== ADD TAKEAWAY MODULE ===\n');

  const industry = await prisma.industryConfig.findFirst({
    where: { slug: 'restaurant' }
  });
  
  if (!industry) {
    console.log('❌ No restaurant industry config found');
    return;
  }
  
  console.log('Found industry:', industry.slug);
  console.log('Current modules:', JSON.stringify(industry.modules, null, 2));
  
  // Add takeaway to modules
  const modules = (industry.modules as Record<string, boolean>) || {};
  modules.takeaway = true;
  
  await prisma.industryConfig.update({
    where: { id: industry.id },
    data: { modules }
  });
  
  console.log('\n✅ Added takeaway module to restaurant industry');
  console.log('New modules:', JSON.stringify(modules, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);
