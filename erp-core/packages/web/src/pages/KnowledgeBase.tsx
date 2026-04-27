import React from 'react';
import { Plus, Search, FileText, FolderOpen, Trash2, Star } from 'lucide-react';
import { api } from '../lib/api';

export default function KnowledgeBase() {
  const [collections, setCollections] = React.useState<any[]>([]);
  const [documents, setDocuments] = React.useState<any[]>([]);
  const [selectedCol, setSelectedCol] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const cols = await api.kb.collections();
      setCollections(cols);
      const docs = await api.kb.documents(selectedCol ? `?collectionId=${selectedCol}` : '');
      setDocuments(docs);
    } catch {}
    setLoading(false);
  }, [selectedCol]);

  React.useEffect(() => { load(); }, [load]);

  const handleSearch = async () => {
    if (!search) return load();
    const results = await api.kb.search(search);
    setDocuments(results);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          <Plus size={16} /> New Document
        </button>
      </div>

      <div className="flex gap-6">
        {/* Collections sidebar */}
        <div className="w-56 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Collections</h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCol(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${!selectedCol ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                All Documents
              </button>
              {collections.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCol(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${selectedCol === c.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <span>{c.icon || '📁'}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : documents.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No documents yet</div>
              ) : documents.map((doc: any) => (
                <div key={doc.id} className="p-4 hover:bg-gray-50 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="text-gray-400 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {doc.word_count || 0} words · Updated {new Date((doc.updated_at || 0) * 1000).toLocaleDateString()}
                      </div>
                      {doc.tags && JSON.parse(doc.tags).length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {JSON.parse(doc.tags).map((tag: string) => (
                            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 hover:bg-gray-100 rounded"><Star size={14} className="text-gray-400" /></button>
                    <button className="p-1.5 hover:bg-gray-100 rounded"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
