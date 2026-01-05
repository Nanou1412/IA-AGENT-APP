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
