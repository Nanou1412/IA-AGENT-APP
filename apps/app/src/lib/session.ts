import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getSession();

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

export async function getUserWithOrg() {
  const user = await requireUser();

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: {
      org: {
        include: {
          settings: true,
          industryConfig: true,
          assignments: {
            include: {
              template: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return { user, membership };
}

export async function requireUserWithOrg() {
  const { user, membership } = await getUserWithOrg();

  if (!membership) {
    redirect('/app/onboarding');
  }

  return { user, membership, org: membership.org };
}

export function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase());
  return adminEmails.includes(email.toLowerCase());
}

export async function requireAdmin() {
  const user = await requireUser();

  // Check admin email list or dev mode
  const isAdmin = isAdminEmail(user.email) || 
    (process.env.NODE_ENV === 'development' && user.email === 'dev@local');

  if (!isAdmin) {
    redirect('/app');
  }

  return user;
}
