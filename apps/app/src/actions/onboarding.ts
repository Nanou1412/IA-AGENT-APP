'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { redirect } from 'next/navigation';

interface CreateOrgInput {
  name: string;
  industry: string;
  timezone: string;
}

export async function createOrg(input: CreateOrgInput) {
  const user = await requireUser();

  // Check if user already has an org
  const existingMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
  });

  if (existingMembership) {
    return { error: 'You already have an organisation' };
  }

  // Find industry config (source of truth for template mapping)
  const industryConfig = await prisma.industryConfig.findUnique({
    where: { slug: input.industry },
  });

  // Find default template from IndustryConfig (no hardcoded mapping)
  let template = null;
  let templateMissing = false;

  if (industryConfig?.defaultTemplateSlug && industryConfig?.defaultTemplateVersion) {
    template = await prisma.agentTemplate.findUnique({
      where: {
        slug_version: {
          slug: industryConfig.defaultTemplateSlug,
          version: industryConfig.defaultTemplateVersion,
        },
      },
    });

    if (!template) {
      // Log error but don't crash - org creation should succeed
      console.error(
        `[createOrg] Template not found: ${industryConfig.defaultTemplateSlug}@${industryConfig.defaultTemplateVersion} for industry ${input.industry}`
      );
      templateMissing = true;
    }
  } else if (industryConfig) {
    // IndustryConfig exists but no template configured
    console.warn(
      `[createOrg] Industry ${input.industry} has no default template configured`
    );
  } else {
    // IndustryConfig doesn't exist at all
    console.error(
      `[createOrg] IndustryConfig not found for industry: ${input.industry}`
    );
  }

  // Create org, membership, settings, and assignment in transaction
  await prisma.$transaction(async (tx) => {
    // Create org
    const org = await tx.org.create({
      data: {
        name: input.name,
        industry: input.industry,
        timezone: input.timezone,
        industryConfigId: industryConfig?.id,
      },
    });

    // Create membership as owner
    await tx.membership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: 'owner',
      },
    });

    // Create org settings with sandbox_required status
    await tx.orgSettings.create({
      data: {
        orgId: org.id,
        sandboxStatus: 'sandbox_required',
        sensitiveModulesStatus: 'pending_review',
      },
    });

    // Create agent assignment if template exists
    if (template) {
      await tx.agentAssignment.create({
        data: {
          orgId: org.id,
          templateId: template.id,
          templateVersion: template.version,
          status: 'pending',
        },
      });
    } else if (templateMissing) {
      // Template was expected but not found - create assignment with pending status
      // This allows admin to fix and activate later
      // Note: We can't create AgentAssignment without a valid templateId (FK constraint)
      // So we just log and the org will have no assignment until admin fixes it
      console.error(
        `[createOrg] Org ${org.id} created without AgentAssignment due to missing template`
      );
    }

    return org;
  });

  // Redirect to sandbox intro page (not /app directly)
  redirect('/app/onboarding/sandbox-intro');
}
