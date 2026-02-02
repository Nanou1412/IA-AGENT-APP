export default function OrdersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-32 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-5 rounded-xl border">
            <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
            <div className="h-4 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-6 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex gap-4">
          <div className="flex-1 h-10 bg-gray-100 rounded-lg" />
          <div className="w-40 h-10 bg-gray-100 rounded-lg" />
          <div className="w-32 h-10 bg-gray-100 rounded-lg" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-3 bg-gray-50 border-b">
          <div className="flex gap-4">
            <div className="w-20 h-4 bg-gray-200 rounded" />
            <div className="w-32 h-4 bg-gray-200 rounded" />
            <div className="w-24 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded" />
          </div>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-6 py-4 border-b flex items-center gap-4">
            <div className="w-20 h-5 bg-gray-200 rounded" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
            <div className="w-16 h-4 bg-gray-100 rounded" />
            <div className="w-20 h-6 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
