import React, { useEffect, useState } from 'react';
import { Factory, Plus, RefreshCw, Play, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Production() {
  const [orders, setOrders] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('orders');
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [o, b] = await Promise.all([
        api.production.orders(),
        api.bom.list(),
      ]);
      setOrders(JSON.parse(o.content[0].text));
      setBoms(JSON.parse(b.content[0].text));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.production.updateStatus(id, status);
      load();
    } catch (err: any) { alert(err.message); }
  };

  const pending = orders.filter((o: any) => o.status === 'pending');
  const inProgress = orders.filter((o: any) => o.status === 'in_progress');
  const completed = orders.filter((o: any) => o.status === 'completed');

  return (
    <div>
      <PageHeader title="Production" description="Work orders, BOMs, and scheduling">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> New Order
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Factory} label="Total Orders" value={orders.length.toString()} color="bg-blue-500" />
        <StatCard icon={Factory} label="Pending" value={pending.length.toString()} color="bg-yellow-500" />
        <StatCard icon={Play} label="In Progress" value={inProgress.length.toString()} color="bg-indigo-500" />
        <StatCard icon={CheckCircle} label="Completed" value={completed.length.toString()} color="bg-green-500" />
      </div>

      <Tabs tabs={[
        { id: 'orders', label: `Orders (${orders.length})` },
        { id: 'boms', label: `BOMs (${boms.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'orders' && (
        <DataTable columns={[
          { header: 'ID', render: (r: any) => <span className="font-mono text-xs">{r.id?.slice(0, 12)}...</span> },
          { header: 'Product', accessor: 'productName' },
          { header: 'Quantity', render: (r: any) => r.quantity || r.totalQuantity || 1 },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'draft'} /> },
          { header: 'Scheduled', render: (r: any) => r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString() : '-' },
          { header: 'Actions', render: (r: any) => (
            <div className="flex gap-1">
              {r.status === 'pending' && <button onClick={() => updateStatus(r.id, 'in_progress')} className="p-1 hover:bg-blue-50 rounded text-blue-600"><Play size={14} /></button>}
              {r.status === 'in_progress' && <button onClick={() => updateStatus(r.id, 'completed')} className="p-1 hover:bg-green-50 rounded text-green-600"><CheckCircle size={14} /></button>}
              {r.status !== 'cancelled' && r.status !== 'completed' && <button onClick={() => updateStatus(r.id, 'cancelled')} className="p-1 hover:bg-red-50 rounded text-red-600"><XCircle size={14} /></button>}
            </div>
          )},
        ]} data={orders} loading={loading} />
      )}

      {tab === 'boms' && (
        <DataTable columns={[
          { header: 'Name', accessor: 'name' },
          { header: 'Product', accessor: 'productName' },
          { header: 'Output Qty', render: (r: any) => r.quantity || r.outputQuantity || 1 },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={boms} loading={loading} />
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Production Order">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.production.create(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="Product Name" name="productName" required />
          <Input label="Quantity" name="quantity" type="number" required />
          <Input label="Scheduled Date" name="scheduledDate" type="date" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
