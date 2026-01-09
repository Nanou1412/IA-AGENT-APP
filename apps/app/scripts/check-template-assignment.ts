import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get the first org
  const org = await prisma.org.findFirst({
    include: {
      industryConfig: true,
    },
  });
  
  if (!org) {
    console.log('No org found');
    return;
  }
  
  console.log('Org:', org.id, org.name);
  console.log('Industry config:', JSON.stringify(org.industryConfig, null, 2));
  
  // Check assignments
  const assignments = await prisma.agentAssignment.findMany({
    where: { orgId: org.id },
    include: { template: true },
  });
  
  console.log('\nAssignments:', assignments.length);
  assignments.forEach(a => {
    console.log('  -', a.status, a.template?.slug, a.template?.version);
  });
  
  // List all templates
  const templates = await prisma.agentTemplate.findMany();
  console.log('\nAvailable templates:', templates.length);
  templates.forEach(t => {
    console.log('  -', t.slug, t.version);
  });
}

main().finally(() => prisma.$disconnect());
