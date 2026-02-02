import { StatsGridSkeleton, CardSkeleton } from '@/components/ui/loading-skeletons';

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-8">
        <div className="h-8 w-64 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-96 bg-gray-100 rounded" />
      </div>

      {/* Status Banner Skeleton */}
      <div className="h-20 bg-gray-100 rounded-lg" />

      {/* Org Info Skeleton */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-6 w-48 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-32 bg-gray-100 rounded" />
          </div>
          <div className="h-8 w-24 bg-gray-100 rounded-full" />
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div>
            <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-6 w-20 bg-gray-200 rounded" />
          </div>
          <div>
            <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-6 w-20 bg-gray-200 rounded" />
          </div>
          <div>
            <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
            <div className="h-6 w-20 bg-gray-200 rounded" />
          </div>
        </div>
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid md:grid-cols-4 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Quick Actions Skeleton */}
      <div className="bg-white p-6 rounded-xl border">
        <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
