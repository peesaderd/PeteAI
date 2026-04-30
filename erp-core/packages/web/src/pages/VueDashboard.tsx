import React from 'react';

export default function VueDashboard() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vue Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Tailwind Vue.js dashboard template</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        <iframe
          src="http://89.167.82.205:55770"
          className="w-full h-full border-0"
          title="Vue Dashboard"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          loading="lazy"
        />
      </div>
    </div>
  );
}
