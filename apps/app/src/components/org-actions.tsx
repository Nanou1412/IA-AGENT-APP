'use client';

import { useTransition } from 'react';
import { Button } from '@repo/ui';
import {
  approveProduction,
  revokeProduction,
  reopenSandbox,
  updateSensitiveModulesStatus,
  activateAssignment,
} from '@/actions/admin';
import { SandboxStatus, SensitiveModulesStatus } from '@prisma/client';

interface OrgActionsProps {
  orgId: string;
  sandboxStatus: SandboxStatus;
  sensitiveStatus: SensitiveModulesStatus;
  pendingAssignmentId?: string;
}

export function OrgActions({
  orgId,
  sandboxStatus,
  sensitiveStatus,
  pendingAssignmentId,
}: OrgActionsProps) {
  const [isPending, startTransition] = useTransition();

  const handleApproveProduction = () => {
    startTransition(async () => {
      const result = await approveProduction(orgId);
      if (result?.error) {
        alert(result.error);
      }
    });
  };

  const handleRevokeProduction = () => {
    if (!confirm('Are you sure you want to revoke production access?')) return;
    startTransition(async () => {
      const result = await revokeProduction(orgId);
      if (result?.error) {
        alert(result.error);
      }
    });
  };

  const handleReopenSandbox = () => {
    startTransition(async () => {
      const result = await reopenSandbox(orgId);
      if (result?.error) {
        alert(result.error);
      }
    });
  };

  const handleEnableSensitive = () => {
    startTransition(async () => {
      const result = await updateSensitiveModulesStatus(
        orgId, 
        SensitiveModulesStatus.enabled
      );
      if (result?.error) {
        alert(result.error);
      }
    });
  };

  const handleDisableSensitive = () => {
    startTransition(async () => {
      const result = await updateSensitiveModulesStatus(
        orgId, 
        SensitiveModulesStatus.disabled
      );
      if (result?.error) {
        alert(result.error);
      }
    });
  };

  const handleActivateAssignment = () => {
    if (pendingAssignmentId) {
      startTransition(async () => {
        const result = await activateAssignment(pendingAssignmentId);
        if (result?.error) {
          alert(result.error);
        }
      });
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-700">Admin Actions</h4>

      <div className="flex flex-wrap gap-2">
        {/* Sandbox Status Actions - Controlled transitions only */}
        {sandboxStatus === SandboxStatus.ready_for_review && (
          <Button 
            onClick={handleApproveProduction} 
            variant="primary" 
            size="sm"
            disabled={isPending}
          >
            {isPending ? 'Processing...' : 'Approve Production'}
          </Button>
        )}

        {sandboxStatus === SandboxStatus.approved && (
          <Button 
            onClick={handleRevokeProduction} 
            variant="outline" 
            size="sm"
            disabled={isPending}
          >
            {isPending ? 'Processing...' : 'Revoke Production'}
          </Button>
        )}

        {sandboxStatus === SandboxStatus.revoked && (
          <Button 
            onClick={handleReopenSandbox} 
            variant="outline" 
            size="sm"
            disabled={isPending}
          >
            {isPending ? 'Processing...' : 'Reopen Sandbox'}
          </Button>
        )}

        {/* Sensitive Modules Actions */}
        {sensitiveStatus === SensitiveModulesStatus.pending_review && (
          <Button 
            onClick={handleEnableSensitive} 
            variant="outline" 
            size="sm"
            disabled={isPending}
          >
            Enable Sensitive Modules
          </Button>
        )}

        {sensitiveStatus === SensitiveModulesStatus.enabled && (
          <Button 
            onClick={handleDisableSensitive} 
            variant="outline" 
            size="sm"
            disabled={isPending}
          >
            Disable Sensitive Modules
          </Button>
        )}

        {/* Assignment Actions */}
        {pendingAssignmentId && (
          <Button 
            onClick={handleActivateAssignment} 
            variant="outline" 
            size="sm"
            disabled={isPending}
          >
            Activate Template
          </Button>
        )}
      </div>

      {/* Status Messages */}
      {sandboxStatus === 'sandbox_required' && (
        <p className="text-sm text-gray-500">
          Organisation needs to start sandbox testing first.
        </p>
      )}

      {sandboxStatus === 'sandbox_in_progress' && (
        <p className="text-sm text-blue-600">
          Sandbox in progress. User must complete onboarding steps and request review.
        </p>
      )}

      {sandboxStatus === 'ready_for_review' && (
        <p className="text-sm text-purple-600">
          ⏳ Awaiting admin review. Review the org&apos;s onboarding and approve if ready.
        </p>
      )}

      {sandboxStatus === 'approved' && (
        <p className="text-sm text-green-600">
          ✅ Production is active. Revoke access if needed.
        </p>
      )}

      {sandboxStatus === 'revoked' && (
        <p className="text-sm text-red-600">
          🚫 Production access revoked. Reopen sandbox if the org needs to redo testing.
        </p>
      )}
    </div>
  );
}
