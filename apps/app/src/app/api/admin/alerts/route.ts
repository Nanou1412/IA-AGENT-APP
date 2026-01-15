/**
 * Admin Alerts API
 * 
 * Returns active alerts for the admin dashboard.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  message: string;
  href?: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const alerts: Alert[] = [];
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

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

    // Check for orgs over budget
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const orgsOverBudget = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "MonthlyOrgCost" mc
      JOIN "OrgSettings" os ON mc."orgId" = os."orgId"
      WHERE mc."month" = ${currentMonth}
      AND (
        (os."monthlyAiBudgetUsd" IS NOT NULL AND mc."aiCostUsd" >= os."monthlyAiBudgetUsd")
        OR (os."monthlyTwilioBudgetUsd" IS NOT NULL AND mc."twilioCostUsd" >= os."monthlyTwilioBudgetUsd")
      )
    `;
    const overBudgetCount = Number(orgsOverBudget[0]?.count || 0);
    if (overBudgetCount > 0) {
      alerts.push({
        id: "over-budget",
        type: "error",
        message: `${overBudgetCount} org(s) over budget`,
        href: "/admin/usage",
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

    // Check for failed webhooks (Stripe events not processed)
    const unprocessedStripeEvents = await prisma.stripeEvent.count({
      where: {
        processed: false,
        createdAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) }, // older than 5 min
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

    // Check for inactive endpoints (no activity in 7 days)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const totalEndpoints = await prisma.channelEndpoint.count({
      where: { isActive: true },
    });
    const activeEndpoints = await prisma.channelEndpoint.count({
      where: {
        isActive: true,
        OR: [
          { messageLogs: { some: { createdAt: { gte: last7d } } } },
          { callLogs: { some: { createdAt: { gte: last7d } } } },
        ],
      },
    });
    const inactiveEndpoints = totalEndpoints - activeEndpoints;
    if (inactiveEndpoints > 0 && totalEndpoints > 0) {
      alerts.push({
        id: "inactive-endpoints",
        type: "info",
        message: `${inactiveEndpoints} endpoint(s) inactive for 7+ days`,
        href: "/admin/endpoints",
      });
    }

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Admin alerts error:", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}
