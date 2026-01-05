import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface TemplateJson {
  slug: string;
  version: string;
  title: string;
  systemPrompt: string;
  intentsAllowed: string[];
  modulesDefault: string[];
  handoffTriggers: string[];
  settingsSchema: Prisma.InputJsonValue;
}

interface IndustryConfigData {
  slug: string;
  title: string;
  rulesJson: Prisma.InputJsonValue;
  defaultTemplateSlug: string | null;
  defaultTemplateVersion: string | null;
  onboardingSteps: string[];
}

// Default onboarding steps - used by all industries
// This is data-driven, not hardcoded business logic
const DEFAULT_ONBOARDING_STEPS = [
  'sandbox_intro_seen',
  'business_profile',
  'handoff_contact',
  'test_conversation',
  'review_request',
];

const industryConfigs: IndustryConfigData[] = [
  {
    slug: 'restaurant',
    title: 'Restaurant',
    rulesJson: {
      maxBookingPartySize: 20,
      requirePhoneForBooking: true,
      allowSameDayBooking: true,
      defaultTimezone: 'Australia/Sydney',
      handoffEnabled: true,
    },
    defaultTemplateSlug: 'restaurant',
    defaultTemplateVersion: '1.0.0',
    onboardingSteps: DEFAULT_ONBOARDING_STEPS,
  },
  {
    slug: 'hotel',
    title: 'Hotel & Accommodation',
    rulesJson: {
      requireCreditCard: true,
      minStayNights: 1,
      maxAdvanceBookingDays: 365,
      defaultTimezone: 'Australia/Sydney',
      handoffEnabled: true,
    },
    defaultTemplateSlug: 'hotel',
    defaultTemplateVersion: '1.0.0',
    onboardingSteps: DEFAULT_ONBOARDING_STEPS,
  },
  {
    slug: 'tradie',
    title: 'Trades & Services',
    rulesJson: {
      requireJobDescription: true,
      requireContactPhone: true,
      emergencyCalloutEnabled: false,
      defaultTimezone: 'Australia/Sydney',
      handoffEnabled: true,
    },
    defaultTemplateSlug: 'tradie',
    defaultTemplateVersion: '1.0.0',
    onboardingSteps: DEFAULT_ONBOARDING_STEPS,
  },
];

async function loadTemplates(): Promise<TemplateJson[]> {
  const templatesDir = path.resolve(__dirname, '../../../packages/templates/src/templates');
  const templates: TemplateJson[] = [];

  if (!fs.existsSync(templatesDir)) {
    console.warn(`Templates directory not found: ${templatesDir}`);
    return templates;
  }

  const industries = fs.readdirSync(templatesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const industry of industries) {
    const industryDir = path.join(templatesDir, industry);
    const files = fs.readdirSync(industryDir)
      .filter(file => file.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(industryDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const template: TemplateJson = JSON.parse(content);
      templates.push(template);
      console.log(`  Loaded: ${template.slug}@${template.version}`);
    }
  }

  return templates;
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Upsert industry configs
  console.log('📦 Upserting industry configs...');
  for (const config of industryConfigs) {
    await prisma.industryConfig.upsert({
      where: { slug: config.slug },
      update: {
        title: config.title,
        rulesJson: config.rulesJson,
        defaultTemplateSlug: config.defaultTemplateSlug,
        defaultTemplateVersion: config.defaultTemplateVersion,
        onboardingSteps: config.onboardingSteps,
      },
      create: {
        slug: config.slug,
        title: config.title,
        rulesJson: config.rulesJson,
        defaultTemplateSlug: config.defaultTemplateSlug,
        defaultTemplateVersion: config.defaultTemplateVersion,
        onboardingSteps: config.onboardingSteps,
      },
    });
    console.log(`  ✓ ${config.slug}: ${config.title} (template: ${config.defaultTemplateSlug}@${config.defaultTemplateVersion}, steps: ${config.onboardingSteps.length})`);
  }

  // Load and upsert templates
  console.log('\n📄 Loading templates from packages/templates...');
  const templates = await loadTemplates();

  console.log('\n💾 Upserting agent templates...');
  for (const template of templates) {
    await prisma.agentTemplate.upsert({
      where: {
        slug_version: {
          slug: template.slug,
          version: template.version,
        },
      },
      update: {
        title: template.title,
        systemPrompt: template.systemPrompt,
        intentsAllowed: template.intentsAllowed,
        modulesDefault: template.modulesDefault,
        handoffTriggers: template.handoffTriggers,
        settingsSchema: template.settingsSchema,
      },
      create: {
        slug: template.slug,
        version: template.version,
        title: template.title,
        systemPrompt: template.systemPrompt,
        intentsAllowed: template.intentsAllowed,
        modulesDefault: template.modulesDefault,
        handoffTriggers: template.handoffTriggers,
        settingsSchema: template.settingsSchema,
      },
    });
    console.log(`  ✓ ${template.slug}@${template.version}: ${template.title}`);
  }

  console.log('\n✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
