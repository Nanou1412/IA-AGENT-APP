'use client';

/**
 * Billing Actions Component
 * 
 * Client component for billing actions (checkout, portal).
 */

import { useTransition } from 'react';
import { Button } from '@repo/ui';
import { createBillingCheckoutSession, createBillingPortalSession } from '@/actions/billing';
import type { BillingStatus } from '@prisma/client';

interface BillingActionsProps {
  billingStatus: BillingStatus;
  sandboxApproved: boolean;
  hasSubscription: boolean;
}

export function BillingActions({ 
  billingStatus, 
  sandboxApproved,
  hasSubscription 
}: BillingActionsProps) {
  const [isPending, startTransition] = useTransition();
  const handleActivateSubscription = () => {
    startTransition(async () => {
      const result = await createBillingCheckoutSession();
      
      if (result.success && result.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = result.checkoutUrl;
      } else if (result.error) {
        alert(result.error);
      }
    });
  };
  
  const handleManageSubscription = () => {
    startTransition(async () => {
      const result = await createBillingPortalSession();
      
      if (result.url) {
        window.location.href = result.url;
      } else if (result.error) {
        alert(result.error);
      }
    });
  };
  
  // If sandbox not approved, show disabled state
  if (!sandboxApproved) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold mb-4">Actions</h3>
        <Button 
          variant="primary" 
          disabled
          className="opacity-50 cursor-not-allowed"
        >
          Activer l&apos;abonnement
        </Button>
        <p className="text-sm text-gray-500 mt-2">
          Complétez d&apos;abord le cycle sandbox pour activer la facturation.
        </p>
      </div>
    );
  }
  
  // Active subscription - show manage button
  if (billingStatus === 'active' && hasSubscription) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold mb-4">Actions</h3>
        <div className="flex gap-4">
          <Button 
            variant="outline" 
            onClick={handleManageSubscription}
            disabled={isPending}
          >
            {isPending ? 'Chargement...' : 'Gérer l\'abonnement'}
          </Button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Accédez au portail Stripe pour modifier vos informations de paiement ou annuler.
        </p>
      </div>
    );
  }
  
  // Past due - show both activate and manage
  if (billingStatus === 'past_due' && hasSubscription) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold mb-4">Actions</h3>
        <div className="flex gap-4">
          <Button 
            variant="primary" 
            onClick={handleManageSubscription}
            disabled={isPending}
          >
            {isPending ? 'Chargement...' : 'Mettre à jour le paiement'}
          </Button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Votre paiement a échoué. Mettez à jour vos informations pour continuer.
        </p>
      </div>
    );
  }
  
  // Inactive, incomplete, or canceled - show activate button
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="font-semibold mb-4">Actions</h3>
      <div className="flex gap-4">
        <Button 
          variant="primary" 
          onClick={handleActivateSubscription}
          disabled={isPending}
        >
          {isPending ? 'Chargement...' : 'Activer l\'abonnement'}
        </Button>
        {hasSubscription && (
          <Button 
            variant="outline" 
            onClick={handleManageSubscription}
            disabled={isPending}
          >
            Gérer l&apos;abonnement
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-500 mt-2">
        Vous serez redirigé vers Stripe pour compléter le paiement sécurisé.
      </p>
    </div>
  );
}
