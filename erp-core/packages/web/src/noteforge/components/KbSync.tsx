import { useState, useEffect, useCallback } from 'react';
import {
  getKBCollections, getKBDocuments, getKBDocument, createKBDocument,
  getErpConfig, loadErpConfig,
} from '../utils/erpApi';
import { Note } from '../types';

interface KbSyncProps {
  notes: Note[];
  onToast: (msg: string) => void;
}

export function KbSync({ notes, onToast }: KbSyncProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewDoc, setViewDoc] = useState<any>(null);

  const config = getErpConfig();
  const isConnected = !!(config.tenantId && config.token);

  const fetchCollections = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getKBCollections();
      const cols = data?.collections || data?.content?.[0]?.text ? JSON.parse(data.content[0].text) : [];
      setCollections(Array.isArray(cols) ? cols : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  const fetchDocuments = useCallback(async (collectionId?: string) => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getKBDocuments({ collectionId });
      const docs = data?.documents || data?.content?.[0]?.text ? JSON.parse(data.content[0].text) : [];
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    loadErpConfig();
    if (isConnected) fetchCollections();
  }, [isConnected, fetchCollections]);

  const handleSync = async (note: Note) => {
    if (!selectedCollection) {
      onToast('Please select a collection first');
      return;
    }
    setSyncing(note.id);
    try {
      await createKBDocument({
        collectionId: selectedCollection,
        title: note.title,
        content: note.content,
        tags: note.tags,
      });
      onToast(`Synced "${note.title}" to Knowledge Base`);
      fetchDocuments(selectedCollection);
    } catch (err: any) {
      onToast(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleViewDocument = async (docId: string) => {
    try {
      const data = await getKBDocument(docId);
      const doc = data?.document || data?.content?.[0]?.text ? JSON.parse(data.content[0].text) : data;
      setViewDoc(doc);
    } catch (err: any) {
      onToast(`Failed to load document: ${err.message}`);
    }
  };

  if (!isConnected) {
    return (
      <div className="erp-container">
        <div className="erp-header"><h2>📚 Knowledge Base Sync</h2></div>
        <div className="erp-not-connected">
          <p>🔌 Connect to ERP in Settings first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-container">
      <div className="erp-header">
        <h2>📚 Knowledge Base Sync</h2>
        <button className="erp-btn" onClick={() => fetchDocuments(selectedCollection)} disabled={loading}>
          {loading ? '⟳ Loading...' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="erp-error">⚠️ {error}</div>}

      <div style={{ marginBottom: 20 }}>
        <label className="erp-label">Collection</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <select
            className="erp-input"
            style={{ flex: 1 }}
            value={selectedCollection}
            onChange={e => {
              setSelectedCollection(e.target.value);
              if (e.target.value) fetchDocuments(e.target.value);
            }}
          >
            <option value="">— Select collection —</option>
            {collections.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name || c.title || c.id}</option>
            ))}
          </select>
          <button className="erp-btn" onClick={fetchCollections} title="Refresh collections">⟳</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Local Notes */}
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>
            📝 Local Notes ({notes.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {notes.map(note => (
              <div
                key={note.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {note.title}
                  {note.tags.length > 0 && (
                    <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 11 }}>
                      {note.tags.map(t => `#${t}`).join(' ')}
                    </span>
                  )}
                </div>
                <button
                  className="erp-btn"
                  style={{ marginLeft: 8, fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => handleSync(note)}
                  disabled={syncing === note.id || !selectedCollection}
                >
                  {syncing === note.id ? '⟳' : '↑ Sync'}
                </button>
              </div>
            ))}
            {notes.length === 0 && <p className="erp-empty">No notes yet</p>}
          </div>
        </div>

        {/* KB Documents */}
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-secondary)' }}>
            📄 KB Documents ({documents.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {documents.map((doc: any) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: 13, cursor: 'pointer',
                }}
                onClick={() => handleViewDocument(doc.id)}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {doc.title || doc.name || 'Untitled'}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
                  {doc.tags?.length ? doc.tags.map((t: string) => `#${t}`).join(' ') : ''}
                </span>
              </div>
            ))}
            {documents.length === 0 && (
              <p className="erp-empty">
                {selectedCollection ? 'No documents in this collection' : 'Select a collection above'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {viewDoc && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setViewDoc(null)}
        >
          <div
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 24, maxWidth: 600, width: '90%',
              maxHeight: '80vh', overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18 }}>{viewDoc.title || viewDoc.name || 'Document'}</h3>
              <button className="erp-btn" onClick={() => setViewDoc(null)}>✕</button>
            </div>
            {viewDoc.tags?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {viewDoc.tags.map((t: string) => (
                  <span key={t} className="tag" style={{ marginRight: 4 }}>#{t}</span>
                ))}
              </div>
            )}
            <div
              className="markdown-preview"
              style={{ maxHeight: '50vh', overflow: 'auto' }}
            >
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 }}>
                {viewDoc.content || viewDoc.body || 'No content'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
