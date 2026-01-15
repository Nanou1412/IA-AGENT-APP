/**
 * Admin Export API
 * 
 * Export data as CSV for orgs, usage, orders, audit logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toCSV(data: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return "";
        if (typeof value === "object") return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );
  return [header, ...rows].join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json({ error: "Type required" }, { status: 400 });
    }

    let csv = "";
    let filename = "";

    switch (type) {
      case "orgs": {
        const orgs = await prisma.org.findMany({
          include: {
            settings: true,
            _count: {
              select: { memberships: true, Order: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        const data = orgs.map((org) => ({
          id: org.id,
          name: org.name,
          industry: org.industry,
          timezone: org.timezone,
          sandboxStatus: org.settings?.sandboxStatus || "unknown",
          billingStatus: org.settings?.billingStatus || "unknown",
          smsEnabled: org.settings?.smsEnabled || false,
          voiceEnabled: org.settings?.voiceEnabled || false,
          members: org._count.memberships,
          orders: org._count.Order,
          createdAt: org.createdAt.toISOString(),
        }));

        csv = toCSV(data as unknown as Record<string, unknown>[], [
          "id",
          "name",
          "industry",
          "timezone",
          "sandboxStatus",
          "billingStatus",
          "smsEnabled",
          "voiceEnabled",
          "members",
          "orders",
          "createdAt",
        ]);
        filename = `orgs-${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }

      case "usage": {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const costs = await prisma.monthlyOrgCost.findMany({
          where: { month: currentMonth },
          include: {
            orgSettings: {
              include: { org: { select: { name: true } } },
            },
          },
        });

        const data = costs.map((cost) => ({
          orgId: cost.orgId,
          orgName: cost.orgSettings?.org?.name || "Unknown",
          month: cost.month,
          aiCostUsd: cost.aiCostUsd,
          twilioCostUsd: cost.twilioCostUsd,
          stripeFeesUsd: cost.stripeFeesUsd,
          totalCostUsd: cost.totalCostUsd,
          aiTokensInput: cost.aiTokensInput,
          aiTokensOutput: cost.aiTokensOutput,
          smsCount: cost.smsCount,
          voiceMinutes: cost.voiceMinutes,
        }));

        csv = toCSV(data as unknown as Record<string, unknown>[], [
          "orgId",
          "orgName",
          "month",
          "aiCostUsd",
          "twilioCostUsd",
          "stripeFeesUsd",
          "totalCostUsd",
          "aiTokensInput",
          "aiTokensOutput",
          "smsCount",
          "voiceMinutes",
        ]);
        filename = `usage-${currentMonth}.csv`;
        break;
      }

      case "orders": {
        const orders = await prisma.order.findMany({
          include: {
            Org: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 1000,
        });

        const data = orders.map((order) => ({
          id: order.id,
          orgName: order.Org?.name || "Unknown",
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail,
          status: order.status,
          paymentStatus: order.paymentStatus,
          amountCents: order.amountTotalCents,
          currency: order.paymentCurrency,
          totalItems: order.totalItems,
          channel: order.channel,
          createdAt: order.createdAt.toISOString(),
          paidAt: order.paidAt?.toISOString() || "",
        }));

        csv = toCSV(data as unknown as Record<string, unknown>[], [
          "id",
          "orgName",
          "customerName",
          "customerPhone",
          "customerEmail",
          "status",
          "paymentStatus",
          "amountCents",
          "currency",
          "totalItems",
          "channel",
          "createdAt",
          "paidAt",
        ]);
        filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }

      case "audit": {
        const logs = await prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 1000,
        });

        const data = logs.map((log) => ({
          id: log.id,
          orgId: log.orgId,
          actorUserId: log.actorUserId,
          action: log.action,
          details: JSON.stringify(log.details),
          createdAt: log.createdAt.toISOString(),
        }));

        csv = toCSV(data as unknown as Record<string, unknown>[], [
          "id",
          "orgId",
          "actorUserId",
          "action",
          "details",
          "createdAt",
        ]);
        filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Admin export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
