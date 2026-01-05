'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUserWithOrg } from '@/lib/session';
import { SandboxStatus, OnboardingStepStatus } from '@prisma/client';
import { 
  DEFAULT_ONBOARDING_STEPS, 
  SANDBOX_REVIEW_THRESHOLD 
} from '@/lib/sandbox-constants';

/**
 * Start sandbox session for an org
 * Transitions: sandbox_required -> sandbox_in_progress
 * Creates onboarding steps from IndustryConfig or fallback
 */
export async function startSandbox() {
  const { user, org } = await requireUserWithOrg();

  // Get current settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId: org.id },
  });

  if (!settings) {
    return { error: 'Organisation settings not found' };
  }

  // Validate state transition
  if (settings.sandboxStatus !== SandboxStatus.sandbox_required) {
    return {
      error: `Cannot start sandbox from status: ${settings.sandboxStatus}. Must be sandbox_required.`,
    };
  }

  // Get industry config for onboarding steps
  const industryConfig = await prisma.industryConfig.findUnique({
    where: { slug: org.industry },
  });

  // Determine steps to create
  const stepsFromConfig = industryConfig?.onboardingSteps as string[] | null;
  const stepsToCreate =
    stepsFromConfig && stepsFromConfig.length > 0
      ? stepsFromConfig
      : DEFAULT_ONBOARDING_STEPS;

  // Transaction: update status + create steps + audit log
  await prisma.$transaction(async (tx) => {
    // Update sandbox status
    await tx.orgSettings.update({
      where: { orgId: org.id },
      data: { sandboxStatus: SandboxStatus.sandbox_in_progress },
    });

    // Create onboarding steps (first one marked as done: sandbox_intro_seen)
    for (const stepKey of stepsToCreate) {
      await tx.orgOnboardingStep.upsert({
        where: {
          orgId_stepKey: {
            orgId: org.id,
            stepKey,
          },
        },
        update: {
          status: stepKey === 'sandbox_intro_seen' 
            ? OnboardingStepStatus.done 
            : OnboardingStepStatus.todo,
        },
        create: {
          orgId: org.id,
          stepKey,
          status: stepKey === 'sandbox_intro_seen' 
            ? OnboardingStepStatus.done 
            : OnboardingStepStatus.todo,
        },
      });
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: user.id,
        action: 'sandbox.started',
        details: {
          previousStatus: settings.sandboxStatus,
          newStatus: SandboxStatus.sandbox_in_progress,
          stepsCreated: stepsToCreate,
        },
      },
    });
  });

  revalidatePath('/app');
  revalidatePath('/app/onboarding/sandbox-intro');

  redirect('/app');
}

/**
 * Complete an onboarding step
 */
export async function completeStep(stepKey: string) {
  const { user, org } = await requireUserWithOrg();

  // Find the step
  const step = await prisma.orgOnboardingStep.findUnique({
    where: {
      orgId_stepKey: {
        orgId: org.id,
        stepKey,
      },
    },
  });

  if (!step) {
    return { error: `Step not found: ${stepKey}` };
  }

  if (step.status === OnboardingStepStatus.done) {
    return { error: 'Step already completed' };
  }

  if (step.status === OnboardingStepStatus.blocked) {
    return { error: 'Step is blocked' };
  }

  // Update step and create audit log
  await prisma.$transaction(async (tx) => {
    await tx.orgOnboardingStep.update({
      where: { id: step.id },
      data: { status: OnboardingStepStatus.done },
    });

    await tx.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: user.id,
        action: 'onboarding.step_completed',
        details: {
          stepKey,
          previousStatus: step.status,
        },
      },
    });
  });

  revalidatePath('/app');

  return { success: true };
}

/**
 * Request production review
 * Transitions: sandbox_in_progress -> ready_for_review
 */
export async function requestReview() {
  const { user, org } = await requireUserWithOrg();

  // Get settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId: org.id },
  });

  if (!settings) {
    return { error: 'Organisation settings not found' };
  }

  // Validate state
  if (settings.sandboxStatus !== SandboxStatus.sandbox_in_progress) {
    return {
      error: `Cannot request review from status: ${settings.sandboxStatus}. Must be sandbox_in_progress.`,
    };
  }

  // Check step completion
  const steps = await prisma.orgOnboardingStep.findMany({
    where: { orgId: org.id },
  });

  const totalSteps = steps.length;
  const completedSteps = steps.filter(
    (s) => s.status === OnboardingStepStatus.done
  ).length;

  // Require at least SANDBOX_REVIEW_THRESHOLD completion
  if (totalSteps > 0 && completedSteps / totalSteps < SANDBOX_REVIEW_THRESHOLD) {
    return {
      error: `Complete at least ${Math.ceil(SANDBOX_REVIEW_THRESHOLD * 100)}% of steps before requesting review. Current: ${completedSteps}/${totalSteps}`,
    };
  }

  // Update status and audit
  await prisma.$transaction(async (tx) => {
    await tx.orgSettings.update({
      where: { orgId: org.id },
      data: { sandboxStatus: SandboxStatus.ready_for_review },
    });

    await tx.auditLog.create({
      data: {
        orgId: org.id,
        actorUserId: user.id,
        action: 'sandbox.review_requested',
        details: {
          previousStatus: settings.sandboxStatus,
          newStatus: SandboxStatus.ready_for_review,
          stepsCompleted: completedSteps,
          totalSteps,
        },
      },
    });
  });

  revalidatePath('/app');

  return { success: true, message: 'Review requested successfully' };
}

/**
 * Get onboarding progress for an org
 */
export async function getOnboardingProgress(orgId: string) {
  const steps = await prisma.orgOnboardingStep.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  });

  const total = steps.length;
  const completed = steps.filter(
    (s) => s.status === OnboardingStepStatus.done
  ).length;
  const inProgress = steps.filter(
    (s) => s.status === OnboardingStepStatus.in_progress
  ).length;
  const blocked = steps.filter(
    (s) => s.status === OnboardingStepStatus.blocked
  ).length;

  return {
    steps,
    total,
    completed,
    inProgress,
    blocked,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
