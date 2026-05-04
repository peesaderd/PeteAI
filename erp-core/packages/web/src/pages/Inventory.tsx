import React, { useEffect, useState } from 'react';
import { Warehouse, Plus, Search, RefreshCw, ArrowUpDown, Package, BarChart3, Layers, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Inventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('stock');
  const [showTransfer, setShowTransfer] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, wh, mv] = await Promise.all([
        api.products.inventory(),
        api.procurement.warehouses(),
        api.procurement.inventoryMovements(),
      ]);
      setInventory(JSON.parse(inv.content[0].text));
      setWarehouses(wh);
      setMovements(mv);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const lowStock = inventory.filter((i: any) => (i.quantity || 0) <= 5);
  const totalValue = inventory.reduce((s: number, i: any) => s + ((i.quantity || 0) * (i.unitCost || i.unit_cost || 0)), 0);

  return (
    <div>
      <PageHeader title="Inventory" description="Stock management, warehouses, and movements">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => setShowTransfer(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <ArrowUpDown size={16} /> Transfer
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Package} label="Total Items" value={inventory.length.toString()} color="bg-blue-500" />
        <StatCard icon={BarChart3} label="Total Value" value={`$${totalValue.toLocaleString()}`} color="bg-green-500" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={lowStock.length.toString()} color="bg-orange-500" />
        <StatCard icon={Layers} label="Warehouses" value={warehouses.length.toString()} color="bg-purple-500" />
      </div>

      <Tabs tabs={[
        { id: 'stock', label: `Stock (${inventory.length})` },
        { id: 'warehouses', label: `Warehouses (${warehouses.length})` },
        { id: 'movements', label: `Movements (${movements.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'stock' && (
        <DataTable columns={[
          { header: 'Product', accessor: 'productName' },
          { header: 'SKU', accessor: 'sku' },
          { header: 'Quantity', render: (r: any) => <span className={`font-bold ${(r.quantity || 0) <= 5 ? 'text-red-600' : ''}`}>{r.quantity || 0}</span> },
          { header: 'Unit Cost', render: (r: any) => `$${(r.unitCost || r.unit_cost || 0).toFixed(2)}` },
          { header: 'Warehouse', render: (r: any) => r.warehouseName || 'Main' },
          { header: 'Status', render: (r: any) => (r.quantity || 0) <= 5 ? <StatusBadge status="low_stock" mapping={{ low_stock: 'bg-red-100 text-red-700' }} /> : <StatusBadge status="in_stock" mapping={{ in_stock: 'bg-green-100 text-green-700' }} /> },
        ]} data={inventory} loading={loading} />
      )}

      {tab === 'warehouses' && (
        <DataTable columns={[
          { header: 'Code', accessor: 'code' },
          { header: 'Name', accessor: 'name' },
          { header: 'Location', render: (r: any) => r.location || r.address || '-' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={warehouses} loading={loading} />
      )}

      {tab === 'movements' && (
        <DataTable columns={[
          { header: 'Product', accessor: 'productName' },
          { header: 'Type', render: (r: any) => <StatusBadge status={r.type || r.movementType || 'transfer'} /> },
          { header: 'Quantity', render: (r: any) => <span className={`font-medium ${(r.quantity || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>{r.quantity || 0}</span> },
          { header: 'From', render: (r: any) => r.fromWarehouse || '-' },
          { header: 'To', render: (r: any) => r.toWarehouse || '-' },
          { header: 'Date', render: (r: any) => new Date(r.createdAt || r.created_at || Date.now()).toLocaleDateString() },
        ]} data={movements} loading={loading} />
      )}

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Inventory">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.procurement.transferInventory(data);
            setShowTransfer(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="Product ID" name="productId" required />
          <Input label="Quantity" name="quantity" type="number" required />
          <Input label="From Warehouse" name="fromWarehouse" />
          <Input label="To Warehouse" name="toWarehouse" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowTransfer(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Transfer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
