import { Button } from '@repo/ui';
import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { RequestReviewButton } from '@/components/request-review-button';
import { SandboxStatus, OnboardingStepStatus } from '@prisma/client';
import { 
  SANDBOX_REVIEW_THRESHOLD,
  getSandboxStatusConfig,
  ONBOARDING_STEP_STATUS_CONFIG
} from '@/lib/sandbox-constants';

// Step labels for display
const STEP_LABELS: Record<string, string> = {
  sandbox_intro_seen: 'Welcome Complete',
  business_profile: 'Business Profile',
  handoff_contact: 'Handoff Contact',
  test_conversation: 'Test Conversation',
  review_request: 'Request Review',
};

const SENSITIVE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  disabled: { label: 'Disabled', color: 'bg-gray-100 text-gray-800' },
  pending_review: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800' },
  enabled: { label: 'Enabled', color: 'bg-green-100 text-green-800' },
};

export default async function DashboardPage() {
  const { user, org } = await requireUserWithOrg();

  const assignment = org.assignments[0];
  const settings = org.settings;

  const sandboxStatus = settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  const sensitiveStatus = settings?.sensitiveModulesStatus ?? 'disabled';

  const statusConfig = getSandboxStatusConfig(sandboxStatus);
  const sensitiveLabel = SENSITIVE_STATUS_LABELS[sensitiveStatus] || SENSITIVE_STATUS_LABELS.disabled;

  // Get onboarding steps
  const onboardingSteps = await prisma.orgOnboardingStep.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: 'asc' },
  });

  const totalSteps = onboardingSteps.length;
  const completedSteps = onboardingSteps.filter(
    (s) => s.status === OnboardingStepStatus.done
  ).length;
  const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Check if can request review (SANDBOX_REVIEW_THRESHOLD)
  const canRequestReviewNow = sandboxStatus === SandboxStatus.sandbox_in_progress && 
    totalSteps > 0 && 
    (completedSteps / totalSteps) >= SANDBOX_REVIEW_THRESHOLD;

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Welcome, {user.name || user.email}!</h1>
        <p className="text-gray-600">Manage your AI agents and view analytics.</p>
      </div>

      {/* Status Banner */}
      <div className={`rounded-lg p-4 mb-8 ${statusConfig.color}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{statusConfig.icon}</span>
          <div>
            <div className="font-semibold">{statusConfig.label}</div>
            <div className="text-sm opacity-80">{statusConfig.description}</div>
          </div>
          {sandboxStatus === SandboxStatus.sandbox_required && (
            <Link
              href="/app/onboarding/sandbox-intro"
              className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Start Sandbox
            </Link>
          )}
        </div>
      </div>

      {/* Onboarding Progress (only show when in progress) */}
      {sandboxStatus === SandboxStatus.sandbox_in_progress && totalSteps > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Onboarding Progress</h3>
            <span className="text-sm text-gray-500">
              {completedSteps}/{totalSteps} steps complete ({percentComplete}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-gray-200 rounded-full mb-4">
            <div
              className="h-2 bg-blue-600 rounded-full transition-all"
              style={{ width: `${percentComplete}%` }}
            />
          </div>

          {/* Steps List */}
          <div className="space-y-2">
            {onboardingSteps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  step.status === OnboardingStepStatus.done
                    ? 'bg-green-50'
                    : step.status === OnboardingStepStatus.in_progress
                    ? 'bg-blue-50'
                    : step.status === OnboardingStepStatus.blocked
                    ? 'bg-red-50'
                    : 'bg-gray-50'
                }`}
              >
                <span className="text-lg">
                  {step.status === OnboardingStepStatus.done ? '✅' : 
                   step.status === OnboardingStepStatus.in_progress ? '🔄' : 
                   step.status === OnboardingStepStatus.blocked ? '🚫' : '⬜'}
                </span>
                <span className="font-medium">
                  {STEP_LABELS[step.stepKey] || step.stepKey}
                </span>
                <span className={`ml-auto text-xs px-2 py-1 rounded ${
                  ONBOARDING_STEP_STATUS_CONFIG[step.status]?.color || 'bg-gray-100 text-gray-800'
                }`}>
                  {ONBOARDING_STEP_STATUS_CONFIG[step.status]?.label || step.status}
                </span>
              </div>
            ))}
          </div>

          {/* Request Review Button */}
          {canRequestReviewNow && (
            <div className="mt-6 pt-4 border-t">
              <div className="text-sm text-gray-600 mb-3">
                You&apos;ve completed enough steps to request production review!
              </div>
              <RequestReviewButton />
            </div>
          )}
        </div>
      )}

      {/* Org Info */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{org.name}</h2>
            <p className="text-gray-500 capitalize">{org.industry} • {org.timezone}</p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div>
            <div className="text-sm text-gray-500">Sandbox Status</div>
            <div className={`inline-block mt-1 px-2 py-0.5 rounded text-sm ${statusConfig.color}`}>
              {statusConfig.label}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Sensitive Modules</div>
            <div className={`inline-block mt-1 px-2 py-0.5 rounded text-sm ${sensitiveLabel.color}`}>
              {sensitiveLabel.label}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Industry Config</div>
            <div className="mt-1 font-medium">
              {org.industryConfig?.title || 'Not configured'}
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Template */}
      {assignment && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <h3 className="font-semibold mb-4">Assigned Template</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{assignment.template.title}</div>
              <div className="text-sm text-gray-500">
                {assignment.template.slug}@{assignment.templateVersion}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  assignment.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : assignment.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {assignment.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500 mb-1">Active Agents</div>
          <div className="text-2xl font-bold">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500 mb-1">Conversations</div>
          <div className="text-2xl font-bold">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500 mb-1">Messages Today</div>
          <div className="text-2xl font-bold">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500 mb-1">Response Rate</div>
          <div className="text-2xl font-bold">--%</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="flex gap-4">
          <Button variant="primary">Configure Agent</Button>
          <Button variant="outline">View Templates</Button>
          <Button variant="outline">Settings</Button>
        </div>
      </div>
    </div>
  );
}
