'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUserWithOrg } from '@/lib/session';

/**
 * Update organization profile (name, industry, timezone)
 * Available to org owners and managers
 */
export async function updateOrgProfile(data: {
  orgId: string;
  name: string;
  industry: string;
  timezone: string;
}) {
  const { user, org } = await requireUserWithOrg();
  
  // Verify user has access to this org
  if (org.id !== data.orgId) {
    return { error: 'Access denied' };
  }

  // Validate timezone
  const validTimezones = [
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Perth',
    'Australia/Adelaide',
    'Pacific/Auckland',
    'America/New_York',
    'America/Los_Angeles',
    'America/Chicago',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Singapore',
  ];
  
  if (!validTimezones.includes(data.timezone)) {
    return { error: 'Invalid timezone' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.org.update({
        where: { id: data.orgId },
        data: {
          name: data.name.trim(),
          industry: data.industry.trim(),
          timezone: data.timezone,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: data.orgId,
          actorUserId: user.id,
          action: 'org.profile.updated',
          details: {
            name: data.name,
            industry: data.industry,
            timezone: data.timezone,
          },
        },
      });
    });

    revalidatePath('/app/settings');
    revalidatePath('/app');
    return { success: true };
  } catch (error) {
    console.error('[updateOrgProfile] Error:', error);
    return { error: 'Failed to update profile' };
  }
}

/**
 * Update handoff settings
 * Available to org owners and managers
 */
export async function updateHandoffSettings(data: {
  orgId: string;
  handoffPhone: string;
  handoffEmail: string;
  handoffSmsTo: string;
  handoffReplyText: string;
}) {
  const { user, org } = await requireUserWithOrg();
  
  if (org.id !== data.orgId) {
    return { error: 'Access denied' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orgSettings.upsert({
        where: { orgId: data.orgId },
        update: {
          handoffPhone: data.handoffPhone.trim() || null,
          handoffEmail: data.handoffEmail.trim() || null,
          handoffSmsTo: data.handoffSmsTo.trim() || null,
          handoffReplyText: data.handoffReplyText.trim() || null,
        },
        create: {
          orgId: data.orgId,
          handoffPhone: data.handoffPhone.trim() || null,
          handoffEmail: data.handoffEmail.trim() || null,
          handoffSmsTo: data.handoffSmsTo.trim() || null,
          handoffReplyText: data.handoffReplyText.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: data.orgId,
          actorUserId: user.id,
          action: 'org.handoff.updated',
          details: {
            handoffPhone: data.handoffPhone,
            handoffEmail: data.handoffEmail,
            handoffSmsTo: data.handoffSmsTo,
          },
        },
      });
    });

    revalidatePath('/app/settings');
    return { success: true };
  } catch (error) {
    console.error('[updateHandoffSettings] Error:', error);
    return { error: 'Failed to update handoff settings' };
  }
}

/**
 * Update messaging settings
 * Available to org owners and managers
 */
export async function updateMessagingSettings(data: {
  orgId: string;
  messagingLocale: string;
  defaultInboundReplyText: string;
  deniedReplyText: string;
  faqText: string;
}) {
  const { user, org } = await requireUserWithOrg();
  
  if (org.id !== data.orgId) {
    return { error: 'Access denied' };
  }

  // Validate locale
  const validLocales = ['en-AU', 'en-US', 'en-GB', 'fr-FR', 'es-ES', 'de-DE', 'ja-JP', 'zh-CN'];
  if (!validLocales.includes(data.messagingLocale)) {
    return { error: 'Invalid locale' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orgSettings.upsert({
        where: { orgId: data.orgId },
        update: {
          messagingLocale: data.messagingLocale,
          defaultInboundReplyText: data.defaultInboundReplyText.trim() || null,
          deniedReplyText: data.deniedReplyText.trim() || null,
          faqText: data.faqText.trim() || null,
        },
        create: {
          orgId: data.orgId,
          messagingLocale: data.messagingLocale,
          defaultInboundReplyText: data.defaultInboundReplyText.trim() || null,
          deniedReplyText: data.deniedReplyText.trim() || null,
          faqText: data.faqText.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: data.orgId,
          actorUserId: user.id,
          action: 'org.messaging.updated',
          details: {
            messagingLocale: data.messagingLocale,
          },
        },
      });
    });

    revalidatePath('/app/settings');
    return { success: true };
  } catch (error) {
    console.error('[updateMessagingSettings] Error:', error);
    return { error: 'Failed to update messaging settings' };
  }
}
