import React, { useEffect, useState } from 'react';
import { ShoppingCart, Plus, Search, RefreshCw, Eye, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState('sales');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.orders.list();
      setOrders(JSON.parse(res.content[0].text));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = orders.filter((o: any) =>
    !search || o.id?.includes(search) || o.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const salesOrders = filtered.filter((o: any) => o.type === 'sales' || !o.type);
  const purchaseOrders = filtered.filter((o: any) => o.type === 'purchase');

  const columns = [
    { header: 'Order ID', render: (r: any) => <span className="font-mono text-xs">{r.id?.slice(0, 12)}...</span> },
    { header: 'Customer', accessor: 'customerName' },
    { header: 'Items', render: (r: any) => r.items?.length || r.totalQuantity || 0 },
    { header: 'Total', render: (r: any) => <span className="font-medium">${(r.total || r.totalAmount || 0).toFixed(2)}</span> },
    { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'pending'} /> },
    { header: 'Date', render: (r: any) => new Date(r.createdAt || r.created_at || Date.now()).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader title="Orders" description="Sales orders and purchase orders">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> New Order
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={ShoppingCart} label="Total Orders" value={orders.length.toString()} color="bg-blue-500" />
        <StatCard icon={Truck} label="Pending" value={orders.filter((o: any) => o.status === 'pending').length.toString()} color="bg-yellow-500" />
        <StatCard icon={ShoppingCart} label="Completed" value={orders.filter((o: any) => o.status === 'completed').length.toString()} color="bg-green-500" />
      </div>

      <Tabs tabs={[
        { id: 'sales', label: `Sales Orders (${salesOrders.length})` },
        { id: 'purchase', label: `Purchase Orders (${purchaseOrders.length})` },
      ]} active={tab} onChange={setTab} />

      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
      </div>

      <DataTable columns={columns} data={tab === 'sales' ? salesOrders : purchaseOrders} loading={loading} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Order">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.orders.create({ ...data, items: [] });
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="Customer Name" name="customerName" required />
          <Select label="Type" name="type" options={[{ value: 'sales', label: 'Sales Order' }, { value: 'purchase', label: 'Purchase Order' }]} />
          <Input label="Total Amount" name="total" type="number" step="0.01" required />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
