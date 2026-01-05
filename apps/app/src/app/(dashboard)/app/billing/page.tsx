/**
 * Billing Page
 * 
 * Shows billing status and allows owners to manage subscription.
 */

import { requireUserWithOrg } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { BillingStatus, MembershipRole, SandboxStatus } from '@prisma/client';
import { BillingActions } from './billing-actions';

// Billing status display configuration
const BILLING_STATUS_CONFIG: Record<BillingStatus, {
  label: string;
  color: string;
  icon: string;
  description: string;
}> = {
  [BillingStatus.inactive]: {
    label: 'Non activé',
    color: 'bg-gray-100 text-gray-800',
    icon: '⚪',
    description: 'Aucun abonnement actif. Activez votre abonnement pour utiliser les modules en production.',
  },
  [BillingStatus.incomplete]: {
    label: 'En attente',
    color: 'bg-yellow-100 text-yellow-800',
    icon: '⏳',
    description: 'Paiement en cours de traitement...',
  },
  [BillingStatus.active]: {
    label: 'Actif',
    color: 'bg-green-100 text-green-800',
    icon: '✅',
    description: 'Votre abonnement est actif. Vous pouvez utiliser tous les modules en production.',
  },
  [BillingStatus.past_due]: {
    label: 'Paiement en retard',
    color: 'bg-red-100 text-red-800',
    icon: '⚠️',
    description: 'Votre dernier paiement a échoué. Veuillez mettre à jour vos informations de paiement.',
  },
  [BillingStatus.canceled]: {
    label: 'Annulé',
    color: 'bg-gray-100 text-gray-800',
    icon: '❌',
    description: 'Votre abonnement a été annulé. Réactivez-le pour continuer à utiliser les modules.',
  },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const { user, org } = await requireUserWithOrg();
  const params = await searchParams;
  
  // Get org settings
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId: org.id },
  });
  
  // Check if user is owner
  const membership = await prisma.membership.findFirst({
    where: {
      orgId: org.id,
      userId: user.id,
    },
  });
  
  const isOwner = membership?.role === MembershipRole.owner;
  const billingStatus = settings?.billingStatus ?? BillingStatus.inactive;
  const sandboxStatus = settings?.sandboxStatus ?? SandboxStatus.sandbox_required;
  const statusConfig = BILLING_STATUS_CONFIG[billingStatus];
  
  // Sandbox must be approved before billing makes sense
  const sandboxApproved = sandboxStatus === SandboxStatus.approved;
  
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Facturation</h1>
      <p className="text-gray-600 mb-8">
        Gérez votre abonnement et vos informations de paiement.
      </p>
      
      {/* Success/Cancel Messages */}
      {params.success === '1' && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <div>
              <div className="font-semibold">Paiement réussi !</div>
              <div className="text-sm">
                Votre abonnement est maintenant actif. Vous pouvez utiliser tous les modules en production.
              </div>
            </div>
          </div>
        </div>
      )}
      
      {params.canceled === '1' && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">ℹ️</span>
            <div>
              <div className="font-semibold">Paiement annulé</div>
              <div className="text-sm">
                Vous avez annulé le processus de paiement. Vous pouvez réessayer à tout moment.
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Sandbox Status Warning */}
      {!sandboxApproved && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧪</span>
            <div>
              <div className="font-semibold">Sandbox non approuvé</div>
              <div className="text-sm">
                Votre sandbox doit être approuvé avant de pouvoir activer la facturation.
                Complétez d'abord le cycle sandbox.
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Billing Status Card */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-2">Statut de l'abonnement</h2>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color}`}>
              <span>{statusConfig.icon}</span>
              <span>{statusConfig.label}</span>
            </div>
            <p className="text-gray-600 mt-3">{statusConfig.description}</p>
          </div>
        </div>
        
        {/* Subscription Details */}
        {settings?.stripeSubscriptionId && (
          <div className="mt-6 pt-6 border-t grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">ID Client Stripe</div>
              <div className="font-mono text-sm">{settings.stripeCustomerId || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">ID Abonnement</div>
              <div className="font-mono text-sm">{settings.stripeSubscriptionId}</div>
            </div>
            {settings.setupFeePaidAt && (
              <div>
                <div className="text-sm text-gray-500">Frais de setup payé le</div>
                <div className="font-medium">
                  {new Date(settings.setupFeePaidAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
            )}
            {settings.currentPeriodEnd && (
              <div>
                <div className="text-sm text-gray-500">Prochaine facturation</div>
                <div className="font-medium">
                  {new Date(settings.currentPeriodEnd).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Actions */}
      {isOwner ? (
        <BillingActions 
          billingStatus={billingStatus}
          sandboxApproved={sandboxApproved}
          hasSubscription={!!settings?.stripeSubscriptionId}
        />
      ) : (
        <div className="bg-gray-50 rounded-lg border p-6 text-center">
          <p className="text-gray-600">
            Seul le propriétaire de l'organisation peut gérer la facturation.
          </p>
        </div>
      )}
      
      {/* Pricing Info */}
      <div className="mt-8 bg-gray-50 rounded-lg border p-6">
        <h3 className="font-semibold mb-4">Tarification</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500 mb-1">Frais de setup (une fois)</div>
            <div className="text-2xl font-bold">$99</div>
            <div className="text-sm text-gray-500 mt-1">
              Configuration initiale et onboarding
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500 mb-1">Abonnement hebdomadaire</div>
            <div className="text-2xl font-bold">$49<span className="text-sm font-normal">/semaine</span></div>
            <div className="text-sm text-gray-500 mt-1">
              Accès complet à tous les modules
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
