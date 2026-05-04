import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, Search, RefreshCw, FileText, FolderOpen, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Tabs, StatCard } from '../components/ui';

export default function KnowledgeBase() {
  const [collections, setCollections] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('collections');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        api.kb.collections(),
        api.kb.documents(),
      ]);
      setCollections(c);
      setDocuments(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = documents.filter((d: any) =>
    !search || d.title?.toLowerCase().includes(search.toLowerCase()) || d.content?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Knowledge Base" description="Documentation and knowledge management">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={FolderOpen} label="Collections" value={collections.length.toString()} color="bg-blue-500" />
        <StatCard icon={FileText} label="Documents" value={documents.length.toString()} color="bg-green-500" />
        <StatCard icon={BookOpen} label="Total KB" value={`${collections.length} colls`} color="bg-purple-500" />
      </div>

      <Tabs tabs={[
        { id: 'collections', label: `Collections (${collections.length})` },
        { id: 'documents', label: `Documents (${documents.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'collections' && (
        <DataTable columns={[
          { header: 'Name', accessor: 'name' },
          { header: 'Description', accessor: 'description' },
          { header: 'Documents', render: (r: any) => r.documentCount || r.count || 0 },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={collections} loading={loading} />
      )}

      {tab === 'documents' && (
        <>
          <div className="mb-4 relative">
            <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <DataTable columns={[
            { header: 'Title', accessor: 'title' },
            { header: 'Collection', accessor: 'collectionName' },
            { header: 'Type', render: (r: any) => r.type || r.mimeType || 'markdown' },
            { header: 'Updated', render: (r: any) => new Date(r.updatedAt || r.updated_at || Date.now()).toLocaleDateString() },
          ]} data={filtered} loading={loading} />
        </>
      )}
    </div>
  );
}
