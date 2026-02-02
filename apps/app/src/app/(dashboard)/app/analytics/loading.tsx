export default function AnalyticsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-36 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-72 bg-gray-100 rounded" />
      </div>

      {/* Overview Stats */}
      <section>
        <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-4 rounded-lg border">
              <div className="h-4 w-28 bg-gray-100 rounded mb-2" />
              <div className="h-8 w-16 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* Volume Metrics */}
      <section>
        <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white p-4 rounded-lg border">
              <div className="h-4 w-24 bg-gray-100 rounded mb-2" />
              <div className="h-6 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* Channel Breakdown */}
      <section>
        <div className="h-5 w-48 bg-gray-200 rounded mb-4" />
        <div className="bg-white rounded-lg border p-6">
          <div className="grid grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full mx-auto mb-2" />
                <div className="h-6 w-12 bg-gray-200 rounded mx-auto mb-1" />
                <div className="h-4 w-16 bg-gray-100 rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Budget */}
      <section>
        <div className="h-5 w-44 bg-gray-200 rounded mb-4" />
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-lg border p-6">
              <div className="flex justify-between mb-4">
                <div>
                  <div className="h-5 w-24 bg-gray-200 rounded mb-1" />
                  <div className="h-3 w-32 bg-gray-100 rounded" />
                </div>
                <div className="text-right">
                  <div className="h-5 w-16 bg-gray-200 rounded mb-1" />
                  <div className="h-3 w-12 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
