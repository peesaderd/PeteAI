import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, RefreshCw, Mail, Tag, Globe, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Marketing() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [emailLists, setEmailLists] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [seoKeywords, setSeoKeywords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('campaigns');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('campaign');

  const load = async () => {
    setLoading(true);
    try {
      const [cmp, el, sub, dis, seo] = await Promise.all([
        api.marketing.campaigns(),
        api.marketing.emailLists(),
        api.marketing.subscribers(),
        api.marketing.discounts(),
        api.marketing.seoKeywords(),
      ]);
      setCampaigns(cmp);
      setEmailLists(el);
      setSubscribers(sub);
      setDiscounts(dis);
      setSeoKeywords(seo);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Marketing" description="Campaigns, email, discounts, SEO, and social">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => { setModalType('campaign'); setShowModal(true); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> New Campaign
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Megaphone} label="Campaigns" value={campaigns.length.toString()} color="bg-blue-500" />
        <StatCard icon={Mail} label="Subscribers" value={subscribers.length.toString()} color="bg-green-500" />
        <StatCard icon={Tag} label="Discounts" value={discounts.length.toString()} color="bg-orange-500" />
        <StatCard icon={BarChart3} label="SEO Keywords" value={seoKeywords.length.toString()} color="bg-purple-500" />
      </div>

      <Tabs tabs={[
        { id: 'campaigns', label: `Campaigns (${campaigns.length})` },
        { id: 'email', label: `Email (${emailLists.length} lists, ${subscribers.length} subs)` },
        { id: 'discounts', label: `Discounts (${discounts.length})` },
        { id: 'seo', label: `SEO (${seoKeywords.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'campaigns' && (
        <DataTable columns={[
          { header: 'Name', accessor: 'name' },
          { header: 'Type', accessor: 'type' },
          { header: 'Budget', render: (r: any) => r.budget ? `$${r.budget.toLocaleString()}` : '-' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'draft'} /> },
          { header: 'Start', render: (r: any) => r.startDate ? new Date(r.startDate).toLocaleDateString() : '-' },
          { header: 'End', render: (r: any) => r.endDate ? new Date(r.endDate).toLocaleDateString() : '-' },
        ]} data={campaigns} loading={loading} />
      )}

      {tab === 'email' && (
        <div className="space-y-6">
          <DataTable columns={[
            { header: 'List Name', accessor: 'name' },
            { header: 'Subscribers', render: (r: any) => r.subscriberCount || r.count || 0 },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
          ]} data={emailLists} loading={loading} />
          <DataTable columns={[
            { header: 'Email', accessor: 'email' },
            { header: 'Name', accessor: 'name' },
            { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
          ]} data={subscribers} loading={loading} />
        </div>
      )}

      {tab === 'discounts' && (
        <DataTable columns={[
          { header: 'Code', accessor: 'code' },
          { header: 'Type', render: (r: any) => r.discountType || r.type || 'percentage' },
          { header: 'Value', render: (r: any) => r.value ? `${r.value}%` : '-' },
          { header: 'Usage', render: (r: any) => `${r.usedCount || 0}/${r.maxUses || '∞'}` },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={discounts} loading={loading} />
      )}

      {tab === 'seo' && (
        <DataTable columns={[
          { header: 'Keyword', accessor: 'keyword' },
          { header: 'Page', accessor: 'page' },
          { header: 'Rank', render: (r: any) => r.rank || '-' },
          { header: 'Volume', render: (r: any) => r.searchVolume || '-' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={seoKeywords} loading={loading} />
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Campaign">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.marketing.createCampaign(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="Campaign Name" name="name" required />
          <Select label="Type" name="type" options={[
            { value: 'email', label: 'Email' },
            { value: 'social', label: 'Social Media' },
            { value: 'seo', label: 'SEO' },
            { value: 'display', label: 'Display Ads' },
          ]} />
          <Input label="Budget" name="budget" type="number" step="0.01" />
          <Input label="Start Date" name="startDate" type="date" />
          <Input label="End Date" name="endDate" type="date" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
