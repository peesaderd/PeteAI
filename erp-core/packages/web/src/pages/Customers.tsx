import React from 'react';
import { Search, Mail, Phone } from 'lucide-react';
import { api } from '../lib/api';

export default function Customers() {
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.mcp('list_customers', { tenantId: 'demo', limit: 50 })
      .then(r => {
        const data = JSON.parse(r.content[0].text);
        setCustomers(data.customers || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search customers..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Orders</th>
                <th className="px-6 py-3">Total Spent</th>
                <th className="px-6 py-3">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No customers found</td></tr>
              ) : customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 flex items-center gap-1"><Mail size={12} />{c.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 flex items-center gap-1"><Phone size={12} />{c.phone || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.order_count || 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${c.total_spent?.toFixed(2) || '0.00'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.created_at ? new Date(c.created_at * 1000).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
