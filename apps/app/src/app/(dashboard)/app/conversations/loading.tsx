export default function ConversationsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex gap-4">
          <div className="flex-1 h-10 bg-gray-100 rounded-lg" />
          <div className="w-40 h-10 bg-gray-100 rounded-lg" />
        </div>
      </div>

      {/* Conversations List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 border-b flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-200 rounded-full" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-48 bg-gray-100 rounded" />
            </div>
            <div className="h-6 w-16 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
