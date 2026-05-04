import React, { useEffect, useState } from 'react';
import { Globe, Plus, RefreshCw, Link2, Unlink, ShoppingBag } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Channels() {
  const [connections, setConnections] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('connections');
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, l] = await Promise.all([
        api.channels.list(),
        api.channels.listings(),
      ]);
      setConnections(JSON.parse(c.content[0].text));
      setListings(JSON.parse(l.content[0].text));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Sales Channels" description="Etsy, marketplaces, and channel management">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Connect Channel
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Globe} label="Connections" value={connections.length.toString()} color="bg-blue-500" />
        <StatCard icon={ShoppingBag} label="Listings" value={listings.length.toString()} color="bg-green-500" />
        <StatCard icon={Link2} label="Active" value={connections.filter((c: any) => c.status === 'active').length.toString()} color="bg-purple-500" />
      </div>

      <Tabs tabs={[
        { id: 'connections', label: `Connections (${connections.length})` },
        { id: 'listings', label: `Listings (${listings.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'connections' && (
        <DataTable columns={[
          { header: 'Channel', accessor: 'channelType' },
          { header: 'Name', accessor: 'name' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
          { header: 'Last Sync', render: (r: any) => r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : '-' },
          { header: 'Actions', render: (r: any) => (
            <button onClick={() => api.channels.delete(r.id).then(load)} className="text-red-500 hover:text-red-700 p-1"><Unlink size={14} /></button>
          )},
        ]} data={connections} loading={loading} />
      )}

      {tab === 'listings' && (
        <DataTable columns={[
          { header: 'Title', accessor: 'title' },
          { header: 'Channel', accessor: 'channelType' },
          { header: 'Price', render: (r: any) => `$${(r.price || 0).toFixed(2)}` },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
          { header: 'Created', render: (r: any) => new Date(r.createdAt || r.created_at || Date.now()).toLocaleDateString() },
        ]} data={listings} loading={loading} />
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Connect Channel">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.channels.create(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Select label="Channel Type" name="channelType" options={[
            { value: 'etsy', label: 'Etsy' },
            { value: 'amazon', label: 'Amazon' },
            { value: 'shopify', label: 'Shopify' },
            { value: 'ebay', label: 'eBay' },
            { value: 'custom', label: 'Custom API' },
          ]} />
          <Input label="Channel Name" name="name" required />
          <Input label="API Key" name="apiKey" />
          <Input label="API Secret" name="apiSecret" type="password" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Connect</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
