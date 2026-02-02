/**
 * Loading skeleton components for consistent loading states
 */

export function CardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-xl border animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-12 h-12 bg-gray-200 rounded-lg" />
        <div className="w-16 h-6 bg-gray-200 rounded-full" />
      </div>
      <div className="w-24 h-4 bg-gray-200 rounded mb-2" />
      <div className="w-16 h-8 bg-gray-200 rounded" />
    </div>
  );
}

export function StatsGridSkeleton() {
  return (
    <div className="grid md:grid-cols-4 gap-6">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="px-6 py-4 flex items-center gap-4 animate-pulse">
      <div className="w-20 h-5 bg-gray-200 rounded" />
      <div className="flex-1">
        <div className="w-32 h-4 bg-gray-200 rounded mb-2" />
        <div className="w-24 h-3 bg-gray-200 rounded" />
      </div>
      <div className="w-16 h-4 bg-gray-200 rounded" />
      <div className="w-20 h-6 bg-gray-200 rounded-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-6 py-3 bg-gray-50 border-b">
        <div className="flex gap-4">
          <div className="w-20 h-4 bg-gray-200 rounded" />
          <div className="w-32 h-4 bg-gray-200 rounded" />
          <div className="w-24 h-4 bg-gray-200 rounded" />
          <div className="w-16 h-4 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <TableRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="p-4 border-b hover:bg-gray-50 animate-pulse">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-gray-200 rounded-full" />
        <div className="flex-1">
          <div className="w-32 h-4 bg-gray-200 rounded mb-2" />
          <div className="w-48 h-3 bg-gray-200 rounded" />
        </div>
        <div className="w-16 h-3 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export function ConversationListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <ConversationSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-white rounded-xl border p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="w-32 h-5 bg-gray-200 rounded" />
        <div className="w-24 h-8 bg-gray-200 rounded" />
      </div>
      <div className={`bg-gray-100 rounded-lg`} style={{ height }} />
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="w-24 h-4 bg-gray-200 rounded mb-2" />
        <div className="w-full h-10 bg-gray-100 rounded-lg" />
      </div>
      <div>
        <div className="w-32 h-4 bg-gray-200 rounded mb-2" />
        <div className="w-full h-10 bg-gray-100 rounded-lg" />
      </div>
      <div>
        <div className="w-20 h-4 bg-gray-200 rounded mb-2" />
        <div className="w-full h-24 bg-gray-100 rounded-lg" />
      </div>
      <div className="flex justify-end">
        <div className="w-24 h-10 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="mb-8 animate-pulse">
      <div className="w-48 h-8 bg-gray-200 rounded mb-2" />
      <div className="w-72 h-4 bg-gray-100 rounded" />
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />
      <StatsGridSkeleton />
      <TableSkeleton />
    </div>
  );
}

// Animated spinner for inline loading
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };
  
  return (
    <svg
      className={`animate-spin text-blue-600 ${sizeClasses[size]}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Loading overlay for forms/cards
export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
      <Spinner size="lg" />
      <p className="mt-3 text-sm text-gray-600">{message}</p>
    </div>
  );
}
