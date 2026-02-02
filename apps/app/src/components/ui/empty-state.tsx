interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
        <span className="text-4xl">{icon}</span>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2 text-center">{title}</h3>
      <p className="text-gray-500 text-center max-w-md mb-6">{description}</p>
      {action && (
        <a
          href={action.href}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          {action.label}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      )}
    </div>
  );
}

// Pre-configured empty states for common scenarios
export function NoConversationsState() {
  return (
    <EmptyState
      icon="💬"
      title="No conversations yet"
      description="When customers send messages via SMS or WhatsApp, their conversations will appear here."
      action={{
        label: "View Settings",
        href: "/app/settings"
      }}
    />
  );
}

export function NoOrdersState() {
  return (
    <EmptyState
      icon="📦"
      title="No orders yet"
      description="Orders placed via SMS or WhatsApp will appear here. Once customers start ordering, you'll see all their orders in this dashboard."
    />
  );
}

export function NoAnalyticsState() {
  return (
    <EmptyState
      icon="📊"
      title="No data available"
      description="Analytics will appear here once you start receiving conversations and orders."
    />
  );
}

export function NoResultsState({ query }: { query?: string }) {
  return (
    <EmptyState
      icon="🔍"
      title="No results found"
      description={query ? `No results found for "${query}". Try adjusting your search or filters.` : "No results match your current filters."}
    />
  );
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Something went wrong"
      description={message || "An error occurred while loading this page. Please try again."}
      action={{
        label: "Refresh Page",
        href: "#"
      }}
    />
  );
}

export function ComingSoonState({ feature }: { feature: string }) {
  return (
    <EmptyState
      icon="🚀"
      title="Coming Soon"
      description={`${feature} is currently under development. Stay tuned for updates!`}
    />
  );
}
