/**
 * Script to check DB state and create missing org/endpoint for Twilio Voice
 */
import { PrismaClient, SandboxStatus, BillingStatus, MembershipRole, MessagingChannel } from '@prisma/client';

const prisma = new PrismaClient();

const TWILIO_PHONE = '+61485000807';

async function main() {
  console.log('=== CHECKING DATABASE STATE ===\n');
  
  // 1. Check user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('❌ No user found - create one first via login');
    return;
  }
  console.log('✅ User found:', user.id, user.email);
  
  // 2. Check org
  let org = await prisma.org.findFirst();
  if (!org) {
    console.log('❌ No org found - creating one...');
    
    // First, get or create industry config for restaurant
    let industryConfig = await prisma.industryConfig.findFirst({
      where: { slug: 'restaurant' },
    });
    
    if (!industryConfig) {
      console.log('Creating IndustryConfig for restaurant...');
      industryConfig = await prisma.industryConfig.create({
        data: {
          slug: 'restaurant',
          title: 'Restaurant',
          modules: { sms: true, voice: true, whatsapp: true, payment: true },
        },
      });
    }
    
    org = await prisma.org.create({
      data: {
        name: 'Demo Restaurant',
        industry: 'restaurant',
        industryConfigId: industryConfig.id,
      },
    });
    console.log('✅ Created org:', org.id, org.name);
    
    // Create membership
    await prisma.membership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: MembershipRole.owner,
      },
    });
    console.log('✅ Created owner membership');
  } else {
    console.log('✅ Org found:', org.id, org.name);
  }
  
  // 3. Check org settings
  let settings = await prisma.orgSettings.findUnique({
    where: { orgId: org.id },
  });
  
  if (!settings) {
    console.log('❌ No OrgSettings found - creating...');
    
    settings = await prisma.orgSettings.create({
      data: {
        orgId: org.id,
        sandboxStatus: SandboxStatus.approved, // BYPASS for testing
        billingStatus: BillingStatus.active,   // BYPASS for testing
        voiceEnabled: true,
        smsEnabled: true,
        whatsappEnabled: true,
      },
    });
    console.log('✅ Created OrgSettings with sandbox=approved, billing=active');
  } else {
    console.log('✅ OrgSettings found:');
    console.log('   sandboxStatus:', settings.sandboxStatus);
    console.log('   billingStatus:', settings.billingStatus);
    console.log('   voiceEnabled:', settings.voiceEnabled);
    
    // Update if needed
    if (settings.sandboxStatus !== SandboxStatus.approved || 
        settings.billingStatus !== BillingStatus.active ||
        !settings.voiceEnabled) {
      console.log('⚠️ Updating settings to allow voice...');
      settings = await prisma.orgSettings.update({
        where: { orgId: org.id },
        data: {
          sandboxStatus: SandboxStatus.approved,
          billingStatus: BillingStatus.active,
          voiceEnabled: true,
        },
      });
      console.log('✅ Updated OrgSettings');
    }
  }
  
  // 4. Check ChannelEndpoint
  let endpoint = await prisma.channelEndpoint.findFirst({
    where: {
      channel: MessagingChannel.voice,
      twilioPhoneNumber: TWILIO_PHONE,
    },
  });
  
  if (!endpoint) {
    console.log('❌ No ChannelEndpoint found for', TWILIO_PHONE, '- creating...');
    
    endpoint = await prisma.channelEndpoint.create({
      data: {
        orgId: org.id,
        channel: MessagingChannel.voice,
        twilioPhoneNumber: TWILIO_PHONE,
        friendlyName: 'Twilio Voice Line',
        isActive: true,
      },
    });
    console.log('✅ Created ChannelEndpoint:', endpoint.id);
  } else {
    console.log('✅ ChannelEndpoint found:', endpoint.id);
    console.log('   channel:', endpoint.channel);
    console.log('   phone:', endpoint.twilioPhoneNumber);
    console.log('   isActive:', endpoint.isActive);
    console.log('   orgId:', endpoint.orgId);
    
    if (!endpoint.isActive) {
      console.log('⚠️ Activating endpoint...');
      await prisma.channelEndpoint.update({
        where: { id: endpoint.id },
        data: { isActive: true },
      });
      console.log('✅ Endpoint activated');
    }
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log('Org ID:', org.id);
  console.log('Endpoint ID:', endpoint.id);
  console.log('Phone:', TWILIO_PHONE);
  console.log('\nTry calling', TWILIO_PHONE, 'now!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
