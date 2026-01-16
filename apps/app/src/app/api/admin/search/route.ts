/**
 * Admin Search API
 * 
 * Global search across orgs, users, sessions, orders, endpoints, logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface SearchResult {
  type: "org" | "user" | "session" | "order" | "endpoint" | "call" | "message";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results: SearchResult[] = [];

    // Search orgs by name or ID
    const orgs = await prisma.org.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { id: { startsWith: query } },
        ],
      },
      take: 5,
      select: { id: true, name: true, industry: true },
    });

    orgs.forEach((org) => {
      results.push({
        type: "org",
        id: org.id,
        label: org.name,
        sublabel: org.industry,
        href: `/admin/orgs/${org.id}`,
      });
    });

    // Search users by email or name
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { id: { startsWith: query } },
        ],
      },
      take: 5,
      select: { id: true, name: true, email: true },
    });

    users.forEach((user) => {
      results.push({
        type: "user",
        id: user.id,
        label: user.name || user.email,
        sublabel: user.email,
        href: `/admin/users/${user.id}`,
      });
    });

    // Search by phone number (endpoints, sessions, orders)
    if (query.startsWith("+") || /^\d{5,}$/.test(query)) {
      const phoneQuery = query.startsWith("+") ? query : `+${query}`;

      // Endpoints
      const endpoints = await prisma.channelEndpoint.findMany({
        where: {
          twilioPhoneNumber: { contains: phoneQuery },
        },
        take: 3,
        include: {
          orgSettings: {
            include: { org: { select: { name: true } } },
          },
        },
      });

      endpoints.forEach((ep) => {
        results.push({
          type: "endpoint",
          id: ep.id,
          label: ep.twilioPhoneNumber,
          sublabel: `${ep.channel} - ${ep.orgSettings?.org?.name || "Unknown"}`,
          href: `/admin/endpoints/${ep.id}`,
        });
      });

      // Sessions by contactKey
      const sessions = await prisma.conversationSession.findMany({
        where: {
          contactKey: { contains: phoneQuery },
        },
        take: 3,
        select: { id: true, contactKey: true, channel: true, status: true },
      });

      sessions.forEach((s) => {
        results.push({
          type: "session",
          id: s.id,
          label: s.contactKey,
          sublabel: `${s.channel} - ${s.status}`,
          href: `/admin/conversations/${s.id}`,
        });
      });

      // Orders by customerPhone
      const orders = await prisma.order.findMany({
        where: {
          customerPhone: { contains: phoneQuery },
        },
        take: 3,
        select: { id: true, customerPhone: true, customerName: true, status: true },
      });

      orders.forEach((o) => {
        results.push({
          type: "order",
          id: o.id,
          label: o.customerPhone,
          sublabel: `${o.customerName || "Unknown"} - ${o.status}`,
          href: `/admin/orders/${o.id}`,
        });
      });
    }

    // Search by ID patterns
    // Session ID
    if (query.length >= 8) {
      const sessionsById = await prisma.conversationSession.findMany({
        where: {
          id: { startsWith: query },
        },
        take: 3,
        select: { id: true, channel: true, status: true, contactKey: true },
      });

      sessionsById.forEach((s) => {
        if (!results.find((r) => r.type === "session" && r.id === s.id)) {
          results.push({
            type: "session",
            id: s.id,
            label: s.id.slice(0, 12) + "...",
            sublabel: `${s.channel} - ${s.contactKey}`,
            href: `/admin/conversations/${s.id}`,
          });
        }
      });

      // Order ID
      const ordersById = await prisma.order.findMany({
        where: {
          id: { startsWith: query },
        },
        take: 3,
        select: { id: true, status: true, customerName: true },
      });

      ordersById.forEach((o) => {
        if (!results.find((r) => r.type === "order" && r.id === o.id)) {
          results.push({
            type: "order",
            id: o.id,
            label: o.id.slice(0, 12) + "...",
            sublabel: `${o.customerName || "Unknown"} - ${o.status}`,
            href: `/admin/orders/${o.id}`,
          });
        }
      });
    }

    // Search by Twilio SIDs
    if (query.startsWith("CA") || query.startsWith("SM") || query.startsWith("WA")) {
      // Call SID
      if (query.startsWith("CA")) {
        const calls = await prisma.callLog.findMany({
          where: {
            twilioCallSid: { startsWith: query },
          },
          take: 3,
          select: { id: true, twilioCallSid: true, from: true, to: true, status: true },
        });

        calls.forEach((c) => {
          results.push({
            type: "call",
            id: c.id,
            label: c.twilioCallSid,
            sublabel: `${c.from} → ${c.to} (${c.status})`,
            href: `/admin/voice?callSid=${c.twilioCallSid}`,
          });
        });
      }

      // Message SID
      if (query.startsWith("SM") || query.startsWith("WA")) {
        const messages = await prisma.messageLog.findMany({
          where: {
            twilioMessageSid: { startsWith: query },
          },
          take: 3,
          select: { id: true, twilioMessageSid: true, from: true, to: true, channel: true },
        });

        messages.forEach((m) => {
          results.push({
            type: "message",
            id: m.id,
            label: m.twilioMessageSid || m.id,
            sublabel: `${m.from} → ${m.to} (${m.channel})`,
            href: `/admin/messaging?messageSid=${m.twilioMessageSid}`,
          });
        });
      }
    }

    // Limit total results
    return NextResponse.json({ results: results.slice(0, 15) });
  } catch (error) {
    console.error("Admin search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
