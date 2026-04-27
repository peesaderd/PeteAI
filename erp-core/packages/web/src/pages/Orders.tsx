import React from 'react';
import { Search, Eye } from 'lucide-react';
import { api } from '../lib/api';

export default function Orders() {
  const [orders, setOrders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.mcp('list_orders', { tenantId: 'demo', limit: 50 })
      .then(r => {
        const data = JSON.parse(r.content[0].text);
        setOrders(data.orders || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search orders..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Order #</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Items</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No orders found</td></tr>
              ) : orders.map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">#{o.order_number || o.id.slice(0, 8)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{o.customer_name || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{o.item_count || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${o.total?.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColors[o.status] || 'bg-gray-100'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{o.created_at ? new Date(o.created_at * 1000).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-4">
                    <button className="p-1 hover:bg-gray-100 rounded"><Eye size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
