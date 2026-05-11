import React, { useEffect, useState } from 'react';
import { Package, Plus, Search, Edit3, Trash2, RefreshCw, BarChart3, Layers } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('products');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p, i, b] = await Promise.all([
        api.products.list(),
        api.products.inventory(),
        api.bom.list(),
      ]);
      setProducts(JSON.parse(p.content[0].text));
      const invData = JSON.parse(i.content[0].text);
      setInventory(Array.isArray(invData) ? invData : (invData.products || []));
      setBoms(JSON.parse(b.content[0].text));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = products.filter((p: any) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { header: 'SKU', accessor: 'sku' },
    { header: 'Name', accessor: 'name' },
    { header: 'Price', render: (r: any) => `$${(r.price || 0).toFixed(2)}` },
    { header: 'Cost', render: (r: any) => `$${(r.cost_price || r.cost || 0).toFixed(2)}` },
    { header: 'Stock', render: (r: any) => {
      const inv = inventory.find((i: any) => i.productId === r.id || i.product_id === r.id || i.id === r.id);
      return <span className={`font-medium ${inv && (inv.quantity || 0) <= 5 ? 'text-red-600' : ''}`}>{inv?.quantity || r.quantity || 0}</span>;
    }},
    { header: 'Status', render: (r: any) => <StatusBadge status={r.status === 'active' ? 'active' : 'inactive'} /> },
  ];

  return (
    <div>
      <PageHeader title="Products" description="Manage products, inventory, and BOMs">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => { setEditItem(null); setShowModal(true); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Add Product
        </button>
      </PageHeader>

      <Tabs tabs={[
        { id: 'products', label: `Products (${products.length})` },
        { id: 'inventory', label: `Inventory (${inventory.length})` },
        { id: 'bom', label: `BOMs (${boms.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'products' && (
        <>
          <div className="mb-4 relative">
            <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <DataTable columns={columns} data={filtered} loading={loading} />
        </>
      )}

      {tab === 'inventory' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatCard icon={Package} label="Total Products" value={inventory.length.toString()} color="bg-blue-500" />
            <StatCard icon={BarChart3} label="Total Value" value={`$${inventory.reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unitCost || i.unit_cost || 0)), 0).toLocaleString()}`} color="bg-green-500" />
            <StatCard icon={Layers} label="Low Stock" value={inventory.filter((i: any) => (i.quantity || 0) <= 5).length.toString()} color="bg-orange-500" />
          </div>
          <DataTable columns={[
            { header: 'Product', accessor: 'productName' },
            { header: 'SKU', accessor: 'sku' },
            { header: 'Quantity', render: (r: any) => <span className="font-medium">{r.quantity || 0}</span> },
            { header: 'Unit Cost', render: (r: any) => `$${(r.unitCost || r.unit_cost || 0).toFixed(2)}` },
            { header: 'Location', render: (r: any) => r.warehouseName || r.location || '-' },
            { header: 'Status', render: (r: any) => (r.quantity || 0) <= 5 ? <StatusBadge status="low_stock" mapping={{ low_stock: 'bg-red-100 text-red-700' }} /> : <StatusBadge status="in_stock" mapping={{ in_stock: 'bg-green-100 text-green-700' }} /> },
          ]} data={inventory} loading={loading} />
        </div>
      )}

      {tab === 'bom' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <DataTable columns={[
            { header: 'Name', accessor: 'name' },
            { header: 'Product', accessor: 'productName' },
            { header: 'Quantity', render: (r: any) => r.quantity || r.outputQuantity || 1 },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
          ]} data={boms} loading={loading} />
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Product' : 'Add Product'}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.products.create(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="Product Name" name="name" required />
          <Input label="SKU" name="sku" required />
          <Input label="Price" name="price" type="number" step="0.01" required />
          <Input label="Cost" name="cost" type="number" step="0.01" />
          <Select label="Status" name="isActive" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
