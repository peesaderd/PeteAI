import React, { useEffect, useState } from 'react';
import { BookOpen, Search, ChevronRight, FileText, Tag, ArrowLeft, ExternalLink } from 'lucide-react';
import { PageHeader, Skeleton } from '../components/ui';

interface DocsModule {
  id: string;
  title: string;
  tags: string[];
}

interface DocsIndex {
  title: string;
  version: string;
  modules: DocsModule[];
}

interface DocsContent {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

interface SearchResult {
  id: string;
  title: string;
  tags: string[];
  score: number;
}

const API_BASE = '/api';

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API Error');
  }
  return res.json();
}

export default function DocsPage() {
  const [index, setIndex] = useState<DocsIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<DocsContent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load index on mount
  useEffect(() => {
    setLoading(true);
    apiGet<DocsIndex>('/docs/')
      .then(setIndex)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Load module content
  const loadModule = async (id: string) => {
    setSelectedModule(null);
    setSearchResults(null);
    setSearchQuery('');
    try {
      const content = await apiGet<DocsContent>(`/docs/modules/${id}`);
      setSelectedModule(content);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Search
  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await apiGet<{ query: string; results: SearchResult[] }>(`/docs/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.results);
    } catch (e: any) {
      setError(e.message);
    }
    setSearching(false);
  };

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Render markdown content simply
  const renderContent = (md: string) => {
    const lines = md.split('\n');
    const html = lines.map((line) => {
      if (line.startsWith('# ')) return `<h1 class="text-2xl font-bold text-gray-900 mt-6 mb-4">${line.slice(2)}</h1>`;
      if (line.startsWith('## ')) return `<h2 class="text-xl font-semibold text-gray-800 mt-5 mb-3">${line.slice(3)}</h2>`;
      if (line.startsWith('### ')) return `<h3 class="text-lg font-medium text-gray-700 mt-4 mb-2">${line.slice(4)}</h3>`;
      if (line.startsWith('- ')) return `<li class="text-gray-600 ml-4 list-disc">${line.slice(2)}</li>`;
      if (line.startsWith('|')) {
        if (line.includes('---')) return '';
        const cells = line.split('|').filter(Boolean).map((c) => `<td class="px-3 py-2 border border-gray-200 text-sm">${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }
      if (line.startsWith('```')) return '';
      if (line.trim() === '') return '<div class="h-2"></div>';
      // Inline code
      const formatted = line.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-red-600 px-1 rounded text-sm">$1</code>');
      return `<p class="text-gray-600 mb-2">${formatted}</p>`;
    }).join('\n');

    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Documentation" description="ERP Core user guide & API reference" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Documentation" description="ERP Core user guide & API reference" />
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load documentation</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Documentation" description={index?.title || 'ERP Core user guide & API reference'}>
        {index?.version && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">v{index.version}</span>
        )}
      </PageHeader>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-3 text-gray-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documentation..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        />
      </div>

      {/* Search Results */}
      {searchResults !== null && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Search results for "{searchQuery}" ({searchResults.length})
          </h3>
          {searchResults.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No results found</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadModule(r.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors text-left"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800">{r.title}</span>
                    <div className="flex gap-1 mt-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Module Content View */}
      {selectedModule ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <button
            onClick={() => { setSelectedModule(null); setSearchResults(null); setSearchQuery(''); }}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mb-4"
          >
            <ArrowLeft size={16} />
            Back to modules
          </button>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedModule.title}</h2>
          <div className="flex gap-2 mb-6">
            {selectedModule.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                <Tag size={10} />
                {t}
              </span>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-4">
            {renderContent(selectedModule.content)}
          </div>
        </div>
      ) : (
        /* Module Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {index?.modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => loadModule(mod.id)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all text-left group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <FileText size={20} className="text-blue-600" />
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{mod.title}</h3>
              <div className="flex flex-wrap gap-1">
                {mod.tags.slice(0, 4).map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
