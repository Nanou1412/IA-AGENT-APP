import { PrismaAdapter } from '@auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import { prisma } from '@/lib/prisma';

const isDevCredentialsEnabled =
  process.env.AUTH_DEV_CREDENTIALS === 'true';

const isSmtpConfigured =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.EMAIL_FROM;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // Email provider (magic link) - only if SMTP configured
    ...(isSmtpConfigured
      ? [
          EmailProvider({
            server: {
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT),
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            },
            from: process.env.EMAIL_FROM,
          }),
        ]
      : []),
    // Dev credentials provider - only in development
    ...(isDevCredentialsEnabled
      ? [
          CredentialsProvider({
            id: 'dev-credentials',
            name: 'Dev Login',
            credentials: {
              email: { label: 'Email', type: 'email' },
              password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
              if (
                credentials?.email === 'dev@local' &&
                credentials?.password === 'dev'
              ) {
                // Find or create dev user
                let user = await prisma.user.findUnique({
                  where: { email: 'dev@local' },
                });

                if (!user) {
                  user = await prisma.user.create({
                    data: {
                      email: 'dev@local',
                      name: 'Dev User',
                    },
                  });
                }

                return {
                  id: user.id,
                  email: user.email,
                  name: user.name,
                };
              }
              return null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};
