import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StartSandboxButton } from '@/components/start-sandbox-button';

// Step labels for display (generic, not industry-specific)
const STEP_LABELS: Record<string, { title: string; description: string }> = {
  sandbox_intro_seen: {
    title: 'Welcome to Sandbox',
    description: 'Review sandbox mode introduction',
  },
  business_profile: {
    title: 'Business Profile',
    description: 'Complete your business information',
  },
  handoff_contact: {
    title: 'Handoff Contact',
    description: 'Set up human handoff contact details',
  },
  test_conversation: {
    title: 'Test Conversation',
    description: 'Have a test conversation with your AI agent',
  },
  review_request: {
    title: 'Request Review',
    description: 'Submit for production activation review',
  },
};

export default async function SandboxIntroPage() {
  const { user, org } = await requireUserWithOrg();

  // Get org settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId: org.id },
  });

  const sandboxStatus = settings?.sandboxStatus ?? 'sandbox_required';

  // If already past sandbox_required, redirect to dashboard
  if (sandboxStatus !== 'sandbox_required') {
    redirect('/app');
  }

  // Get agent assignment
  const assignment = await prisma.agentAssignment.findFirst({
    where: { orgId: org.id },
    include: { template: true },
  });

  // Get industry config for onboarding steps preview
  const industryConfig = await prisma.industryConfig.findUnique({
    where: { slug: org.industry },
  });

  // Get steps to preview (from industry config or fallback)
  const stepsFromConfig = industryConfig?.onboardingSteps as string[] | null;
  const previewSteps = stepsFromConfig && stepsFromConfig.length > 0
    ? stepsFromConfig
    : ['sandbox_intro_seen', 'business_profile', 'handoff_contact', 'review_request'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-xl shadow-sm border">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🧪</div>
          <h1 className="text-3xl font-bold mb-2">Welcome to Your Sandbox</h1>
          <p className="text-gray-600">
            Your organisation <strong>{org.name}</strong> has been created successfully!
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-3">What is Sandbox Mode?</h2>
          <p className="text-blue-800 mb-4">
            Sandbox mode lets you test your AI agent safely before going live. 
            You can make test calls, configure settings, and ensure everything works 
            perfectly without affecting real customers.
          </p>
          <ul className="text-blue-800 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-500">✓</span>
              Test calls are free and don&apos;t charge your account
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">✓</span>
              Configure your agent&apos;s personality and responses
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">✓</span>
              Review conversation logs to fine-tune behaviour
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500">✓</span>
              When ready, request production activation
            </li>
          </ul>
        </div>

        {/* Onboarding Steps Preview */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">What You&apos;ll Complete</h3>
          <div className="space-y-3">
            {previewSteps.map((stepKey, index) => {
              const stepInfo = STEP_LABELS[stepKey] || { title: stepKey, description: '' };
              return (
                <div key={stepKey} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{stepInfo.title}</div>
                    <div className="text-xs text-gray-500">{stepInfo.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Your Setup</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Organisation:</span>
              <span className="font-medium">{org.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Industry:</span>
              <span className="font-medium capitalize">{org.industry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Template:</span>
              <span className="font-medium">
                {assignment?.template 
                  ? `${assignment.template.title} (v${assignment.templateVersion})`
                  : <span className="text-amber-600">Pending assignment</span>
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                Ready to Start
              </span>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-green-800">
            <strong>Ready to begin!</strong> Click the button below to start your sandbox session.
            You&apos;ll be guided through each step to get your AI agent ready for production.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <StartSandboxButton />
          
          <Link
            href="/app"
            className="w-full py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium text-center hover:bg-gray-50 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          Need help? Contact support or check our documentation.
        </p>
      </div>
    </div>
  );
}
