/**
 * Admin Header Wrapper (Server Component)
 * 
 * Fetches alerts and renders the client AdminHeader.
 */

import { prisma } from "@/lib/prisma";
import { AdminHeader } from "./admin-header";

interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  message: string;
  href?: string;
}

async function getAlerts(): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Check for orgs pending approval
    const pendingApprovals = await prisma.orgSettings.count({
      where: { sandboxStatus: "ready_for_review" },
    });
    if (pendingApprovals > 0) {
      alerts.push({
        id: "pending-approvals",
        type: "warning",
        message: `${pendingApprovals} org(s) pending approval`,
        href: "/admin/orgs?status=ready_for_review",
      });
    }

    // Check for recent errors
    const recentErrors = await prisma.engineRun.count({
      where: {
        createdAt: { gte: last24h },
        status: { in: ["error", "blocked"] },
      },
    });
    if (recentErrors > 10) {
      alerts.push({
        id: "engine-errors",
        type: "error",
        message: `${recentErrors} engine errors in last 24h`,
        href: "/admin/debug",
      });
    }

    // Check for failed webhooks
    const unprocessedStripeEvents = await prisma.stripeEvent.count({
      where: {
        processed: false,
        createdAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) },
      },
    });
    if (unprocessedStripeEvents > 0) {
      alerts.push({
        id: "stripe-webhooks",
        type: "error",
        message: `${unprocessedStripeEvents} unprocessed Stripe events`,
        href: "/admin/debug/stripe",
      });
    }

    // Check for orgs with past_due billing
    const pastDueOrgs = await prisma.orgSettings.count({
      where: { billingStatus: "past_due" },
    });
    if (pastDueOrgs > 0) {
      alerts.push({
        id: "past-due",
        type: "warning",
        message: `${pastDueOrgs} org(s) with past due billing`,
        href: "/admin/billing",
      });
    }
  } catch (error) {
    console.error("Error fetching alerts:", error);
  }

  return alerts;
}

export async function AdminHeaderWrapper() {
  const alerts = await getAlerts();
  
  // Determine environment (could be from env var or other source)
  const currentEnv = process.env.NODE_ENV === "production" ? "prod" : "sandbox";

  return <AdminHeader alerts={alerts} currentEnv={currentEnv as "prod" | "sandbox"} />;
}
