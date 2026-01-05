# Phase 4 - Twilio Messaging - Validation Checklist

## 🎯 Objectif
Intégration complète de Twilio SMS & WhatsApp avec:
- Webhooks inbound (Twilio → nous)
- Outbound senders (nous → Twilio)
- Résolution org par numéro Twilio
- Logs complets (MessageLog) + audit
- Feature gating strict (sandbox/billing/config)

## ✅ Checklist de Validation

### Schéma Prisma
- [ ] Enum `MessagingChannel` (sms, whatsapp)
- [ ] Enum `MessageDirection` (inbound, outbound)
- [ ] Model `ChannelEndpoint` avec relations
- [ ] Model `MessageLog` avec unique constraint sur `twilioMessageSid`
- [ ] Champs `smsEnabled` et `whatsappEnabled` dans `OrgSettings`
- [ ] Index appropriés pour les performances

### Configuration Twilio
- [ ] Variables d'environnement dans `.env.example`:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_MESSAGING_SERVICE_SID`
  - `TWILIO_WEBHOOK_SIGNATURE_VALIDATION`
- [ ] Package `twilio` installé

### Lib Twilio (`src/lib/twilio.ts`)
- [ ] Client Twilio lazy-initialisé
- [ ] `normalizePhoneNumber(phone, channel)` - E.164 + whatsapp prefix
- [ ] `stripWhatsAppPrefix(phone)` 
- [ ] `isWhatsAppNumber(phone)`
- [ ] `validateTwilioSignature(signature, url, params)`
- [ ] `generateTwiMLResponse(message)`
- [ ] Messages par défaut FR

### Helpers Twilio (`src/lib/twilio-helpers.ts`)
- [ ] `resolveOrgFromTwilioNumber(toNumber, channel)`
- [ ] `getActiveEndpointForOrg(orgId, channel)`
- [ ] `createMessageLog(input)` avec idempotence
- [ ] `updateMessageLogStatus(sid, status, errorCode?, errorMessage?)`
- [ ] `logTwilioAudit(action, details, options?)`
- [ ] `isChannelEnabledForOrg(orgId, channel)`

### Webhooks
- [ ] `/api/twilio/sms/route.ts` - Inbound SMS
  - [ ] Parse form-urlencoded body
  - [ ] Validation signature Twilio (production)
  - [ ] Résolution org par numéro
  - [ ] Idempotence via MessageSid
  - [ ] Feature gating (sandbox/billing/config)
  - [ ] Réponse TwiML
  - [ ] Audit logging
  
- [ ] `/api/twilio/whatsapp/route.ts` - Inbound WhatsApp
  - [ ] Même logique que SMS avec channel='whatsapp'
  - [ ] Gestion du préfixe whatsapp:
  
- [ ] `/api/twilio/status/route.ts` - Status callbacks
  - [ ] Update MessageLog.status
  - [ ] Log failures (delivered/failed)

### Actions Serveur (`src/actions/twilio.ts`)
- [ ] `sendSms(input)` - Envoi SMS sortant
- [ ] `sendWhatsApp(input)` - Envoi WhatsApp sortant
- [ ] `getMessageLogs(orgId, options?)` - Liste des messages
- [ ] `getChannelEndpoints(orgId)` - Liste des endpoints
- [ ] Feature gating sur tous les envois
- [ ] Authentification + vérification membership

### UI Admin
- [ ] `/admin/messaging/page.tsx`
  - [ ] Stats sommaires (endpoints, messages)
  - [ ] Liste des ChannelEndpoints
  - [ ] Configuration messaging par org
  - [ ] Messages récents (tous orgs)

### Tests
- [ ] `src/__tests__/twilio.test.ts`
  - [ ] Tests normalizePhoneNumber
  - [ ] Tests stripWhatsAppPrefix
  - [ ] Tests isWhatsAppNumber
  - [ ] Tests generateTwiMLResponse
  - [ ] Tests messages constants

### Scripts
- [ ] `scripts/simulate-twilio-webhook.ts`
  - [ ] Simulation SMS inbound
  - [ ] Simulation WhatsApp inbound
  - [ ] Simulation status callback

## 🧪 Tests à Exécuter

```bash
# Migration Prisma
cd apps/app
pnpm prisma migrate dev --name add_twilio_messaging
pnpm prisma generate

# Build TypeScript
pnpm tsc --noEmit

# Tests unitaires
pnpm test

# Simulation webhook (serveur doit tourner)
npx ts-node scripts/simulate-twilio-webhook.ts sms +61400111222 +61412345678 "Test message"
npx ts-node scripts/simulate-twilio-webhook.ts whatsapp +61400111222 +61412345678 "Test message"
npx ts-node scripts/simulate-twilio-webhook.ts status SM123456 delivered
```

## 🔒 Sécurité

1. **Signature Validation**: Toujours activer en production
2. **Rate Limiting**: À considérer pour les webhooks
3. **Audit Trail**: Toutes les actions sont loggées
4. **Feature Gating**: Triple vérification (sandbox/billing/config)

## 📊 Monitoring Recommandé

- Alertes sur `twilio.message.delivery_failed`
- Dashboard des volumes SMS/WhatsApp par org
- Tracking des erreurs Twilio par code

## 🚀 Configuration Twilio (Console)

1. Aller dans Twilio Console > Messaging > Services
2. Configurer les webhooks:
   - SMS: `https://your-domain.com/api/twilio/sms`
   - WhatsApp: `https://your-domain.com/api/twilio/whatsapp`
   - Status Callback: `https://your-domain.com/api/twilio/status`
3. Activer la validation de signature
4. Ajouter les numéros comme ChannelEndpoint dans la base

## 📝 Notes d'Architecture

- **Idempotence**: MessageLog.twilioMessageSid unique constraint
- **Multi-tenant**: Résolution org par ChannelEndpoint.twilioPhoneNumber
- **Extensible**: Prêt pour d'autres channels (voice, email)
- **Audit**: Tous les événements tracés dans AuditLog
