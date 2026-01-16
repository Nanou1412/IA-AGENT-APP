/**
 * Admin Header Component
 * 
 * Top navigation bar for admin pages with:
 * - Global search (Ctrl+K)
 * - Prod/Sandbox switch
 * - Alerts notification
 * - Export menu
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "org" | "user" | "session" | "order" | "endpoint" | "call" | "message";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  message: string;
  href?: string;
}

interface AdminHeaderProps {
  alerts?: Alert[];
  currentEnv?: "prod" | "sandbox";
}

export function AdminHeader({ alerts = [], currentEnv = "prod" }: AdminHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const router = useRouter();

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsAlertsOpen(false);
        setIsExportOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Search function
  const performSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    router.push(result.href);
  };

  const handleExport = async (type: string) => {
    setIsExportOpen(false);
    // Trigger download
    window.location.href = `/api/admin/export?type=${type}`;
  };

  const getResultIcon = (type: SearchResult["type"]) => {
    const icons: Record<string, string> = {
      org: "🏢",
      user: "👤",
      session: "💬",
      order: "📦",
      endpoint: "📞",
      call: "☎️",
      message: "✉️",
    };
    return icons[type] || "📄";
  };

  const unreadAlerts = alerts.filter((a) => a.type === "error" || a.type === "warning");

  return (
    <>
      {/* Admin Sub-header */}
      <div className="bg-brand-night text-white px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Env badge + Search */}
          <div className="flex items-center gap-4">
            {/* Env Badge */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                currentEnv === "prod"
                  ? "bg-red-500 text-white"
                  : "bg-amber-400 text-primary-900"
              }`}
            >
              {currentEnv === "prod" ? "🔴 PRODUCTION" : "🟡 SANDBOX"}
            </span>

            {/* Search Button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 bg-primary-800/50 hover:bg-primary-700/50 px-3 py-1.5 rounded text-sm"
            >
              <span>🔍</span>
              <span className="hidden md:inline">Search...</span>
              <kbd className="hidden md:inline bg-primary-700/50 px-1.5 py-0.5 rounded text-xs">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Export */}
            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="flex items-center gap-1 hover:bg-primary-800/50 px-2 py-1 rounded text-sm"
              >
                📤 <span className="hidden md:inline">Export</span>
              </button>
              {isExportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white text-gray-900 rounded-lg shadow-lg py-2 min-w-[160px] z-50">
                  <button
                    onClick={() => handleExport("orgs")}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    📋 Organizations
                  </button>
                  <button
                    onClick={() => handleExport("usage")}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    📊 Usage Report
                  </button>
                  <button
                    onClick={() => handleExport("orders")}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    📦 Orders
                  </button>
                  <button
                    onClick={() => handleExport("audit")}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    📝 Audit Logs
                  </button>
                </div>
              )}
            </div>

            {/* Alerts */}
            <div className="relative">
              <button
                onClick={() => setIsAlertsOpen(!isAlertsOpen)}
                className="relative flex items-center hover:bg-primary-800/50 px-2 py-1 rounded"
              >
                🔔
                {unreadAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadAlerts.length}
                  </span>
                )}
              </button>
              {isAlertsOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white text-gray-900 rounded-lg shadow-lg py-2 min-w-[280px] max-h-[300px] overflow-y-auto z-50">
                  {alerts.length === 0 ? (
                    <p className="px-4 py-3 text-gray-500 text-sm">No alerts</p>
                  ) : (
                    alerts.map((alert) => (
                      <Link
                        key={alert.id}
                        href={alert.href || "#"}
                        className={`block px-4 py-2 hover:bg-gray-100 text-sm border-l-4 ${
                          alert.type === "error"
                            ? "border-red-500"
                            : alert.type === "warning"
                            ? "border-yellow-500"
                            : "border-blue-500"
                        }`}
                        onClick={() => setIsAlertsOpen(false)}
                      >
                        {alert.message}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Quick links */}
            <Link
              href="/admin/kill-switches"
              className="hover:bg-primary-800/50 px-2 py-1 rounded text-sm"
              title="Kill Switches"
            >
              🚨
            </Link>
            <Link
              href="/admin/debug"
              className="hover:bg-primary-800/50 px-2 py-1 rounded text-sm"
              title="Debug"
            >
              🔧
            </Link>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b">
              <span className="text-gray-400">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search orgs, users, phones, orders, sessions..."
                className="flex-1 outline-none text-lg"
                autoFocus
              />
              {isSearching && (
                <span className="text-gray-400 animate-spin">⏳</span>
              )}
              <button
                onClick={() => setIsSearchOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {searchQuery.length < 2 ? (
                <div className="p-4 text-gray-500 text-sm">
                  <p>Type at least 2 characters to search</p>
                  <p className="mt-2 text-xs">
                    Search by: org name, email, phone (+61...), order ID, session ID, callSid
                  </p>
                </div>
              ) : searchResults.length === 0 && !isSearching ? (
                <div className="p-4 text-gray-500 text-sm">
                  No results found for &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="py-2">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 flex items-center gap-3"
                    >
                      <span className="text-xl">{getResultIcon(result.type)}</span>
                      <div>
                        <p className="font-medium">{result.label}</p>
                        {result.sublabel && (
                          <p className="text-sm text-gray-500">{result.sublabel}</p>
                        )}
                      </div>
                      <span className="ml-auto text-xs text-gray-400 uppercase">
                        {result.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t bg-gray-50 rounded-b-xl flex items-center justify-between text-xs text-gray-500">
              <span>
                <kbd className="bg-gray-200 px-1.5 py-0.5 rounded">↑↓</kbd> to navigate
              </span>
              <span>
                <kbd className="bg-gray-200 px-1.5 py-0.5 rounded">Enter</kbd> to select
              </span>
              <span>
                <kbd className="bg-gray-200 px-1.5 py-0.5 rounded">Esc</kbd> to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
