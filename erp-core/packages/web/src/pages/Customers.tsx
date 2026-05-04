import React, { useEffect, useState } from 'react';
import { Users, Plus, Search, RefreshCw, Mail, Phone, MapPin, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, StatCard } from '../components/ui';

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.customers.list();
      setCustomers(JSON.parse(res.content[0].text));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = customers.filter((c: any) =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const loadInsights = async (c: any) => {
    setSelected(c);
    try {
      const res = await api.customers.insights(c.id);
      setInsights(JSON.parse(res.content[0].text));
    } catch (e) { setInsights(null); }
  };

  const columns = [
    { header: 'Name', render: (r: any) => <span className="font-medium">{r.name || r.firstName + ' ' + r.lastName}</span> },
    { header: 'Email', render: (r: any) => <span className="text-gray-500">{r.email}</span> },
    { header: 'Phone', render: (r: any) => r.phone || '-' },
    { header: 'Orders', render: (r: any) => r.totalOrders || r.orderCount || 0 },
    { header: 'Total Spent', render: (r: any) => <span className="font-medium">${(r.totalSpent || r.totalRevenue || 0).toFixed(2)}</span> },
    { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
  ];

  return (
    <div>
      <PageHeader title="Customers" description="Customer management and insights">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Users} label="Total Customers" value={customers.length.toString()} color="bg-blue-500" />
        <StatCard icon={TrendingUp} label="Avg Lifetime Value" value={`$${customers.length ? (customers.reduce((s: number, c: any) => s + (c.totalSpent || 0), 0) / customers.length).toFixed(2) : '0.00'}`} color="bg-green-500" />
        <StatCard icon={Mail} label="Active" value={customers.filter((c: any) => c.status !== 'inactive').length.toString()} color="bg-purple-500" />
      </div>

      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DataTable columns={columns} data={filtered} loading={loading} onRowClick={loadInsights} />
        </div>
        {selected && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold mb-4">{selected.name || selected.firstName + ' ' + selected.lastName}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600"><Mail size={14} /> {selected.email}</div>
              <div className="flex items-center gap-2 text-gray-600"><Phone size={14} /> {selected.phone || '-'}</div>
              {insights && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="font-medium mb-2">Insights</h4>
                  <p className="text-gray-600">Total Orders: {insights.totalOrders || insights.orderCount || 0}</p>
                  <p className="text-gray-600">Total Spent: ${(insights.totalSpent || 0).toFixed(2)}</p>
                  <p className="text-gray-600">Avg Order: ${(insights.averageOrderValue || 0).toFixed(2)}</p>
                  <p className="text-gray-600">Last Purchase: {insights.lastPurchaseDate ? new Date(insights.lastPurchaseDate).toLocaleDateString() : 'N/A'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
