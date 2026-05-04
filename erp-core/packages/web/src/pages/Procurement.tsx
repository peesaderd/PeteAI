import React, { useEffect, useState } from 'react';
import { Truck, Plus, RefreshCw, Package, Building2, ClipboardList } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Procurement() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('suppliers');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('supplier');

  const load = async () => {
    setLoading(true);
    try {
      const [sup, po, wh] = await Promise.all([
        api.procurement.suppliers(),
        api.procurement.purchaseOrders(),
        api.procurement.warehouses(),
      ]);
      setSuppliers(sup);
      setPurchaseOrders(po);
      setWarehouses(wh);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Procurement" description="Suppliers, purchase orders, and warehouses">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => { setModalType('supplier'); setShowModal(true); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Add Supplier
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Building2} label="Suppliers" value={suppliers.length.toString()} color="bg-blue-500" />
        <StatCard icon={ClipboardList} label="Purchase Orders" value={purchaseOrders.length.toString()} color="bg-yellow-500" />
        <StatCard icon={Package} label="Warehouses" value={warehouses.length.toString()} color="bg-green-500" />
      </div>

      <Tabs tabs={[
        { id: 'suppliers', label: `Suppliers (${suppliers.length})` },
        { id: 'purchase-orders', label: `POs (${purchaseOrders.length})` },
        { id: 'warehouses', label: `Warehouses (${warehouses.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'suppliers' && (
        <DataTable columns={[
          { header: 'Code', accessor: 'code' },
          { header: 'Name', accessor: 'name' },
          { header: 'Contact', render: (r: any) => r.contactName || r.contactPerson || '-' },
          { header: 'Email', accessor: 'email' },
          { header: 'Phone', accessor: 'phone' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={suppliers} loading={loading} />
      )}

      {tab === 'purchase-orders' && (
        <DataTable columns={[
          { header: 'PO #', render: (r: any) => <span className="font-mono text-xs">{r.id?.slice(0, 12)}...</span> },
          { header: 'Supplier', accessor: 'supplierName' },
          { header: 'Items', render: (r: any) => r.items?.length || r.totalQuantity || 0 },
          { header: 'Total', render: (r: any) => `$${(r.total || r.totalAmount || 0).toFixed(2)}` },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'draft'} /> },
          { header: 'Date', render: (r: any) => new Date(r.createdAt || r.created_at || Date.now()).toLocaleDateString() },
        ]} data={purchaseOrders} loading={loading} />
      )}

      {tab === 'warehouses' && (
        <DataTable columns={[
          { header: 'Code', accessor: 'code' },
          { header: 'Name', accessor: 'name' },
          { header: 'Location', render: (r: any) => r.location || r.address || '-' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={warehouses} loading={loading} />
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={modalType === 'supplier' ? 'Add Supplier' : 'New Purchase Order'}>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            if (modalType === 'supplier') await api.procurement.createSupplier(data);
            else await api.procurement.createPurchaseOrder(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          {modalType === 'supplier' ? (
            <>
              <Input label="Supplier Code" name="code" required />
              <Input label="Supplier Name" name="name" required />
              <Input label="Contact Name" name="contactName" />
              <Input label="Email" name="email" type="email" />
              <Input label="Phone" name="phone" />
            </>
          ) : (
            <>
              <Input label="Supplier Name" name="supplierName" required />
              <Input label="Total Amount" name="total" type="number" step="0.01" />
            </>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
