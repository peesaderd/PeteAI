import React from 'react';
import { Package, ShoppingCart, Users, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = React.useState<any>(null);

  React.useEffect(() => {
    api.mcp('get_sales_report', { tenantId: 'demo', period: '30d' })
      .then(r => {
        const data = JSON.parse(r.content[0].text);
        setStats(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={DollarSign} label="Total Revenue" value={stats ? `$${stats.totalRevenue?.toLocaleString()}` : '-'} color="bg-green-500" />
        <StatCard icon={ShoppingCart} label="Total Orders" value={stats?.totalOrders || '-'} sub="Last 30 days" color="bg-blue-500" />
        <StatCard icon={TrendingUp} label="Avg Order Value" value={stats ? `$${stats.averageOrderValue?.toFixed(2)}` : '-'} color="bg-purple-500" />
        <StatCard icon={AlertTriangle} label="Low Stock Items" value="-" sub="Requires attention" color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="p-4 bg-blue-50 rounded-lg text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
              + New Product
            </button>
            <button className="p-4 bg-green-50 rounded-lg text-green-700 text-sm font-medium hover:bg-green-100 transition-colors">
              + New Order
            </button>
            <button className="p-4 bg-purple-50 rounded-lg text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors">
              + New Document
            </button>
            <button className="p-4 bg-orange-50 rounded-lg text-orange-700 text-sm font-medium hover:bg-orange-100 transition-colors">
              Sync Etsy
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">ERP Core Server</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Running</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Knowledge Base</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Running</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Etsy Connector</span>
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Not Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
