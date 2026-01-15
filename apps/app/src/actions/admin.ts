'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { SandboxStatus, SensitiveModulesStatus } from '@prisma/client';

/**
 * Approve production for an org
 * Transitions: ready_for_review -> approved
 */
export async function approveProduction(orgId: string) {
  const admin = await requireAdmin();

  // Get current settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });

  if (!settings) {
    return { error: 'Organisation settings not found' };
  }

  // Validate state transition
  if (settings.sandboxStatus !== SandboxStatus.ready_for_review) {
    return {
      error: `Cannot approve from status: ${settings.sandboxStatus}. Must be ready_for_review.`,
    };
  }

  // Update status and audit
  await prisma.$transaction(async (tx) => {
    await tx.orgSettings.update({
      where: { orgId },
      data: { sandboxStatus: SandboxStatus.approved },
    });

    await tx.auditLog.create({
      data: {
        orgId,
        actorUserId: admin.id,
        action: 'production.approved',
        details: {
          previousStatus: settings.sandboxStatus,
          newStatus: SandboxStatus.approved,
        },
      },
    });
  });

  revalidatePath(`/admin/orgs/${orgId}`);
  revalidatePath('/admin/orgs');

  return { success: true };
}

/**
 * Revoke production for an org
 * Transitions: approved -> revoked
 */
export async function revokeProduction(orgId: string) {
  const admin = await requireAdmin();

  // Get current settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });

  if (!settings) {
    return { error: 'Organisation settings not found' };
  }

  // Validate state transition
  if (settings.sandboxStatus !== SandboxStatus.approved) {
    return {
      error: `Cannot revoke from status: ${settings.sandboxStatus}. Must be approved.`,
    };
  }

  // Update status and audit
  await prisma.$transaction(async (tx) => {
    await tx.orgSettings.update({
      where: { orgId },
      data: { sandboxStatus: SandboxStatus.revoked },
    });

    await tx.auditLog.create({
      data: {
        orgId,
        actorUserId: admin.id,
        action: 'production.revoked',
        details: {
          previousStatus: settings.sandboxStatus,
          newStatus: SandboxStatus.revoked,
        },
      },
    });
  });

  revalidatePath(`/admin/orgs/${orgId}`);
  revalidatePath('/admin/orgs');

  return { success: true };
}

/**
 * Reopen sandbox for an org (after revocation or to redo testing)
 * Transitions: revoked -> sandbox_in_progress
 */
export async function reopenSandbox(orgId: string) {
  const admin = await requireAdmin();

  // Get current settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });

  if (!settings) {
    return { error: 'Organisation settings not found' };
  }

  // Only allow from revoked status
  if (settings.sandboxStatus !== SandboxStatus.revoked) {
    return {
      error: `Cannot reopen sandbox from status: ${settings.sandboxStatus}. Must be revoked.`,
    };
  }

  // Update status and audit
  await prisma.$transaction(async (tx) => {
    await tx.orgSettings.update({
      where: { orgId },
      data: { sandboxStatus: SandboxStatus.sandbox_in_progress },
    });

    await tx.auditLog.create({
      data: {
        orgId,
        actorUserId: admin.id,
        action: 'sandbox.reopened',
        details: {
          previousStatus: settings.sandboxStatus,
          newStatus: SandboxStatus.sandbox_in_progress,
        },
      },
    });
  });

  revalidatePath(`/admin/orgs/${orgId}`);
  revalidatePath('/admin/orgs');

  return { success: true };
}

/**
 * Update sensitive modules status
 * With validation and audit logging
 */
export async function updateSensitiveModulesStatus(
  orgId: string,
  status: SensitiveModulesStatus
) {
  const admin = await requireAdmin();

  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
  });

  if (!settings) {
    return { error: 'Organisation settings not found' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.orgSettings.update({
      where: { orgId },
      data: { sensitiveModulesStatus: status },
    });

    await tx.auditLog.create({
      data: {
        orgId,
        actorUserId: admin.id,
        action: 'sensitive_modules.updated',
        details: {
          previousStatus: settings.sensitiveModulesStatus,
          newStatus: status,
        },
      },
    });
  });

  revalidatePath(`/admin/orgs/${orgId}`);
  revalidatePath('/admin/orgs');

  return { success: true };
}

/**
 * Activate an agent assignment
 */
export async function activateAssignment(assignmentId: string) {
  const admin = await requireAdmin();

  const assignment = await prisma.agentAssignment.findUnique({
    where: { id: assignmentId },
  });

  if (!assignment) {
    return { error: 'Assignment not found' };
  }

  await prisma.$transaction(async (tx) => {
    // Deactivate any existing active assignments for this org
    await tx.agentAssignment.updateMany({
      where: {
        orgId: assignment.orgId,
        status: 'active',
      },
      data: { status: 'rolled_back' },
    });

    // Activate this assignment
    await tx.agentAssignment.update({
      where: { id: assignmentId },
      data: { status: 'active' },
    });

    await tx.auditLog.create({
      data: {
        orgId: assignment.orgId,
        actorUserId: admin.id,
        action: 'assignment.activated',
        details: {
          assignmentId,
          templateId: assignment.templateId,
          templateVersion: assignment.templateVersion,
        },
      },
    });
  });

  revalidatePath(`/admin/orgs/${assignment.orgId}`);

  return { success: true };
}

/**
 * Get audit logs for an org
 */
export async function getAuditLogs(orgId: string, limit = 50) {
  await requireAdmin();

  const logs = await prisma.auditLog.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs;
}

// ============================================================================
// Organization Management
// ============================================================================

export interface CreateOrganizationInput {
  name: string;
  industry: string;
  timezone?: string;
  ownerEmail: string;
}

/**
 * Create a new organization with owner
 * Creates: Org, OrgSettings, User (if not exists), Membership
 */
export async function createOrganization(input: CreateOrganizationInput) {
  const admin = await requireAdmin();

  const { name, industry, timezone = 'Australia/Sydney', ownerEmail } = input;

  // Validate inputs
  if (!name || name.trim().length < 2) {
    return { error: 'Organization name must be at least 2 characters' };
  }

  if (!industry) {
    return { error: 'Industry is required' };
  }

  if (!ownerEmail || !ownerEmail.includes('@')) {
    return { error: 'Valid owner email is required' };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find or create user
      let user = await tx.user.findUnique({
        where: { email: ownerEmail.toLowerCase() },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: ownerEmail.toLowerCase(),
            name: ownerEmail.split('@')[0],
          },
        });
      }

      // Check if user already has an org
      const existingMembership = await tx.membership.findFirst({
        where: { userId: user.id },
      });

      if (existingMembership) {
        throw new Error(`User ${ownerEmail} already belongs to an organization`);
      }

      // Create organization
      const org = await tx.org.create({
        data: {
          name: name.trim(),
          industry,
          timezone,
        },
      });

      // Create org settings
      await tx.orgSettings.create({
        data: {
          orgId: org.id,
          sandboxStatus: SandboxStatus.sandbox_required,
        },
      });

      // Create owner membership
      await tx.membership.create({
        data: {
          userId: user.id,
          orgId: org.id,
          role: 'owner',
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          orgId: org.id,
          actorUserId: admin.id,
          action: 'org.created',
          details: {
            name: org.name,
            industry: org.industry,
            ownerEmail,
            createdBy: admin.email,
          },
        },
      });

      return { org, user };
    });

    revalidatePath('/admin/orgs');
    return { success: true, orgId: result.org.id };
  } catch (error) {
    console.error('[createOrganization] Error:', error);
    return { 
      error: error instanceof Error ? error.message : 'Failed to create organization' 
    };
  }
}

// ============================================================================
// Twilio & Voice Configuration
// ============================================================================

export interface UpdateOrgTwilioConfigInput {
  twilioPhoneNumber?: string;
  voiceEnabled?: boolean;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
  callWelcomeText?: string;
  handoffPhone?: string;
}

/**
 * Update Twilio and voice configuration for an org
 */
export async function updateOrgTwilioConfig(
  orgId: string,
  input: UpdateOrgTwilioConfigInput
) {
  const admin = await requireAdmin();

  // Validate phone number format if provided
  if (input.twilioPhoneNumber && !input.twilioPhoneNumber.match(/^\+[1-9]\d{6,14}$/)) {
    return { error: 'Invalid phone number format. Must be E.164 format (e.g., +61485000807)' };
  }

  try {
    // Get org to verify it exists
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      include: { settings: true },
    });

    if (!org) {
      return { error: 'Organisation not found' };
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    
    if (input.voiceEnabled !== undefined) {
      updateData.voiceEnabled = input.voiceEnabled;
    }
    if (input.smsEnabled !== undefined) {
      updateData.smsEnabled = input.smsEnabled;
    }
    if (input.whatsappEnabled !== undefined) {
      updateData.whatsappEnabled = input.whatsappEnabled;
    }
    if (input.callWelcomeText !== undefined) {
      updateData.callWelcomeText = input.callWelcomeText;
    }
    if (input.handoffPhone !== undefined) {
      updateData.handoffPhone = input.handoffPhone;
    }

    await prisma.$transaction(async (tx) => {
      // Update OrgSettings
      if (Object.keys(updateData).length > 0) {
        await tx.orgSettings.update({
          where: { orgId },
          data: updateData,
        });
      }

      // Handle Twilio phone number - create or update ChannelEndpoint
      if (input.twilioPhoneNumber) {
        // Check if this number is already assigned to another org
        const existingEndpoint = await tx.channelEndpoint.findFirst({
          where: {
            twilioPhoneNumber: input.twilioPhoneNumber,
            NOT: { orgId },
          },
        });

        if (existingEndpoint) {
          throw new Error(`Phone number ${input.twilioPhoneNumber} is already assigned to another organisation`);
        }

        // Upsert voice endpoint
        await tx.channelEndpoint.upsert({
          where: {
            channel_twilioPhoneNumber: {
              channel: 'voice',
              twilioPhoneNumber: input.twilioPhoneNumber,
            },
          },
          create: {
            orgId,
            channel: 'voice',
            twilioPhoneNumber: input.twilioPhoneNumber,
            friendlyName: `Voice - ${input.twilioPhoneNumber}`,
          },
          update: {
            orgId,
            isActive: true,
          },
        });

        // Also create SMS endpoint if SMS is enabled
        if (input.smsEnabled) {
          await tx.channelEndpoint.upsert({
            where: {
              channel_twilioPhoneNumber: {
                channel: 'sms',
                twilioPhoneNumber: input.twilioPhoneNumber,
              },
            },
            create: {
              orgId,
              channel: 'sms',
              twilioPhoneNumber: input.twilioPhoneNumber,
              friendlyName: `SMS - ${input.twilioPhoneNumber}`,
            },
            update: {
              orgId,
              isActive: true,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId: admin.id,
          action: 'org.twilio_config_updated',
          details: JSON.parse(JSON.stringify(input)),
        },
      });
    });

    revalidatePath(`/admin/orgs/${orgId}`);
    return { success: true };
  } catch (error) {
    console.error('[updateOrgTwilioConfig] Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to update Twilio configuration',
    };
  }
}

// ============================================================================
// Template Assignment
// ============================================================================

/**
 * Assign a template to an organization
 * Creates a new AgentAssignment with 'active' status
 * Deactivates any existing active assignments
 */
export async function assignTemplateToOrg(
  orgId: string,
  templateSlug: string,
  templateVersion?: string
) {
  const admin = await requireAdmin();

  try {
    // Find the template
    const template = await prisma.agentTemplate.findFirst({
      where: {
        slug: templateSlug,
        ...(templateVersion ? { version: templateVersion } : {}),
      },
      orderBy: { createdAt: 'desc' }, // Get latest version if not specified
    });

    if (!template) {
      return { error: `Template "${templateSlug}" not found` };
    }

    // Check org exists
    const org = await prisma.org.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      return { error: 'Organisation not found' };
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active assignments
      await tx.agentAssignment.updateMany({
        where: {
          orgId,
          status: 'active',
        },
        data: { status: 'rolled_back' },
      });

      // Create new assignment as active
      await tx.agentAssignment.create({
        data: {
          orgId,
          templateId: template.id,
          templateVersion: template.version,
          status: 'active',
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId: admin.id,
          action: 'template.assigned',
          details: {
            templateSlug: template.slug,
            templateVersion: template.version,
            templateTitle: template.title,
          },
        },
      });
    });

    revalidatePath(`/admin/orgs/${orgId}`);
    return { success: true };
  } catch (error) {
    console.error('[assignTemplateToOrg] Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to assign template',
    };
  }
}

/**
 * Get all available templates
 */
export async function getAvailableTemplates() {
  await requireAdmin();

  const templates = await prisma.agentTemplate.findMany({
    orderBy: [{ slug: 'asc' }, { version: 'desc' }],
  });

  // Group by slug and get latest version of each
  const latestTemplates = templates.reduce((acc, template) => {
    if (!acc[template.slug]) {
      acc[template.slug] = template;
    }
    return acc;
  }, {} as Record<string, typeof templates[0]>);

  return Object.values(latestTemplates);
}

// ============================================================================
// User Management
// ============================================================================

export interface AddUserToOrgInput {
  userId: string;
  orgId: string;
  role: 'owner' | 'manager' | 'staff';
}

/**
 * Add a user to an organization
 */
export async function addUserToOrg(input: AddUserToOrgInput) {
  const admin = await requireAdmin();

  const { userId, orgId, role } = input;

  // Validate inputs
  if (!userId || !orgId || !role) {
    return { error: 'All fields are required' };
  }

  const validRoles = ['owner', 'manager', 'staff'];
  if (!validRoles.includes(role)) {
    return { error: 'Invalid role' };
  }

  try {
    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { error: 'User not found' };
    }

    // Check org exists
    const org = await prisma.org.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      return { error: 'Organization not found' };
    }

    // Check if membership already exists
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    });

    if (existingMembership) {
      return { error: 'User is already a member of this organization' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: {
          userId,
          orgId,
          role,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId: admin.id,
          action: 'membership.created',
          details: {
            userId,
            userEmail: user.email,
            role,
          },
        },
      });
    });

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath(`/admin/orgs/${orgId}`);
    return { success: true };
  } catch (error) {
    console.error('[addUserToOrg] Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to add user to organization',
    };
  }
}

/**
 * Remove a user from an organization
 */
export async function removeUserFromOrg(userId: string, orgId: string) {
  const admin = await requireAdmin();

  try {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
      include: {
        user: { select: { email: true } },
      },
    });

    if (!membership) {
      return { error: 'Membership not found' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({
        where: {
          userId_orgId: {
            userId,
            orgId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorUserId: admin.id,
          action: 'membership.removed',
          details: {
            userId,
            userEmail: membership.user.email,
            previousRole: membership.role,
          },
        },
      });
    });

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath(`/admin/orgs/${orgId}`);
    return { success: true };
  } catch (error) {
    console.error('[removeUserFromOrg] Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to remove user from organization',
    };
  }
}
