# Phase 3 Stripe Billing - Checklist de Validation

## Pré-requis

### Variables d'environnement (.env)
```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ia_agent"

# Stripe (utiliser clés TEST)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."  # Généré par Stripe CLI

# Price IDs (créer dans Stripe Dashboard)
STRIPE_SETUP_FEE_PRICE_ID="price_..."      # One-time $99
STRIPE_WEEKLY_SUB_PRICE_ID="price_..."     # Recurring $49/week

# App
NEXTAUTH_URL="http://localhost:3001"
NEXTAUTH_SECRET="dev-secret-32-chars-minimum-here"
```

### Services requis
- [ ] Docker Desktop démarré
- [ ] PostgreSQL running (`docker compose up -d`)
- [ ] Stripe CLI installé (`brew install stripe/stripe-cli/stripe`)

---

## 1️⃣ Migration + Prisma

```bash
# Démarrer la DB
cd /Users/norchenekrb/ia-agent-app
docker compose up -d

# Appliquer les migrations
cd apps/app
pnpm prisma migrate dev

# Vérifier les tables
pnpm prisma studio
```

**Vérifications:**
- [ ] Table `StripeEvent` existe avec colonnes: stripeEventId, type, orgId, processed, processedAt, raw, error
- [ ] Table `OrgSettings` a les colonnes: billingStatus, stripeCustomerId, stripeSubscriptionId, setupFeePaidAt, currentPeriodEnd
- [ ] Enum `BillingStatus` contient: inactive, incomplete, active, past_due, canceled

---

## 2️⃣ Tests Unitaires

```bash
cd /Users/norchenekrb/ia-agent-app
pnpm install  # Installe vitest

cd apps/app
pnpm test
```

**Vérifications:**
- [ ] `mapStripeStatusToBillingStatus` - 10 tests passent
- [ ] `extractPeriodEnd` - 4 tests passent
- [ ] `resolveOrgFromStripeEvent` - 4 tests passent
- [ ] `canUseModule` (feature gating) - tous les scénarios passent

---

## 3️⃣ Test Idempotence

```bash
cd /Users/norchenekrb/ia-agent-app/apps/app
pnpm stripe:test:idempotency
```

**Attendu:**
- [ ] "ATTEMPT 1" traite l'event
- [ ] "ATTEMPT 2" retourne `alreadyProcessed: true`
- [ ] "TEST PASSED" affiché

---

## 4️⃣ Test Fallback Resolution (sans metadata)

```bash
cd /Users/norchenekrb/ia-agent-app/apps/app
pnpm stripe:test:fallback
```

**Attendu:**
- [ ] Event créé SANS `metadata.orgId`
- [ ] Org résolu via `stripeCustomerId` (Strategy 2)
- [ ] "ORG RESOLVED SUCCESSFULLY" affiché

---

## 5️⃣ Test E2E Checkout (Stripe CLI)

### Terminal 1 - Stripe CLI
```bash
stripe login
stripe listen --forward-to http://localhost:3001/api/stripe/webhook
# Copier le webhook secret (whsec_...) dans .env
```

### Terminal 2 - Dev Server
```bash
cd /Users/norchenekrb/ia-agent-app
pnpm dev
```

### Terminal 3 - Setup Test Org
```bash
cd /Users/norchenekrb/ia-agent-app/apps/app
pnpm stripe:setup
```

### Browser
1. Ouvrir http://localhost:3001/app/billing
2. Cliquer "Activer l'abonnement"
3. Compléter checkout Stripe (carte test: 4242 4242 4242 4242)
4. Vérifier redirect success

**Vérifications après checkout:**
- [ ] `billingStatus` = `active`
- [ ] `stripeSubscriptionId` non null
- [ ] `setupFeePaidAt` défini
- [ ] `currentPeriodEnd` = date + 7 jours

---

## 6️⃣ Vérifier Audit Logs

```bash
cd /Users/norchenekrb/ia-agent-app/apps/app
pnpm stripe:debug
```

Ou via browser: http://localhost:3001/admin/debug/stripe

**Attendu (après checkout complet):**
- [ ] `billing.checkout_started` présent
- [ ] `billing.checkout_completed` présent
- [ ] `billing.invoice_paid` présent
- [ ] `billing.subscription_updated` présent

---

## 7️⃣ Test Status Mapping (via Stripe Dashboard)

Dans Stripe Dashboard (Test Mode):
1. Aller sur la subscription
2. Actions → "Update subscription" pour changer status
3. Observer les webhooks et l'update DB

**Mappings à vérifier:**
- [ ] `active` → `BillingStatus.active`
- [ ] `past_due` → `BillingStatus.past_due`
- [ ] `canceled` → `BillingStatus.canceled`
- [ ] `trialing` → `BillingStatus.active`

---

## 8️⃣ Test Feature Gating

```bash
cd /Users/norchenekrb/ia-agent-app/apps/app
pnpm test -- feature-gating
```

**Scénarios validés:**
- [ ] sandbox_required + any billing → blockedBy: 'sandbox'
- [ ] approved + inactive → blockedBy: 'billing'
- [ ] approved + active → allowed: true
- [ ] revoked + active → blockedBy: 'admin'

---

## 9️⃣ Test Payment Failed (optional)

```bash
# Simuler échec de paiement
stripe trigger invoice.payment_failed
```

**Attendu:**
- [ ] `billingStatus` passe à `past_due`
- [ ] Audit log `billing.invoice_failed` créé
- [ ] Feature gating bloque les modules sensibles

---

## 🔟 Cleanup

```bash
# Supprimer test data
cd /Users/norchenekrb/ia-agent-app/apps/app
pnpm prisma studio
# Supprimer manuellement les orgs de test
```

---

## Résumé des Commandes

| Commande | Description |
|----------|-------------|
| `pnpm test` | Lancer tests unitaires |
| `pnpm stripe:setup` | Créer org de test (sandbox approved) |
| `pnpm stripe:debug` | Afficher état billing (CLI) |
| `pnpm stripe:test:idempotency` | Tester idempotence webhooks |
| `pnpm stripe:test:fallback` | Tester résolution org sans metadata |

---

## Debug Page

URL: http://localhost:3001/admin/debug/stripe

Affiche:
- Toutes les OrgSettings avec billing fields
- 25 derniers StripeEvents (processed/pending)
- 25 derniers AuditLogs billing.*

Filtrable par Org ID.
