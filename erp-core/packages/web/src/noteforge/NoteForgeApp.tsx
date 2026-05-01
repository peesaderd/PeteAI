import { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { GraphView } from './components/GraphView';
import { SearchDialog } from './components/SearchDialog';
import { ErpDashboard } from './components/ErpDashboard';
import { ErpSettings } from './components/ErpSettings';
import { KbSync } from './components/KbSync';
import { useVault } from './hooks/useVault';
import { loadErpConfig } from './utils/erpApi';

type View = 'editor' | 'graph' | 'erp' | 'erp-settings' | 'kb-sync';

export default function NoteForgeApp() {
  const {
    vault, activeNote, searchQuery, setSearchQuery,
    activeTag, setActiveTag,
    addNote, updateNote, deleteNote, setActiveNote,
    getFilteredNotes, getAllTags, getGraphData,
  } = useVault();

  const [view, setView] = useState<View>('editor');
  const [searchOpen, setSearchOpen] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const [erpConnected, setErpConnected] = useState(() => {
    const cfg = loadErpConfig();
    return !!(cfg.tenantId && cfg.token);
  });

  const filteredNotes = getFilteredNotes();
  const tags = getAllTags();
  const graphData = getGraphData();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        const id = addNote();
        setActiveNote(id);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        setView(v => v === 'editor' ? 'graph' : 'editor');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setView('erp');
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addNote, setActiveNote]);

  const showToast = useCallback((msg: string) => {
    setToasts(prev => [...prev, msg]);
    setTimeout(() => setToasts(prev => prev.slice(1)), 2000);
  }, []);

  function handleNavigateToNote(title: string) {
    const note = Object.values(vault.notes).find(n => n.title === title);
    if (note) {
      setActiveNote(note.id);
    } else {
      const id = addNote(title);
      setActiveNote(id);
      showToast('Created new note: ' + title);
    }
  }

  return (
    <div className="noteforge-app">
      <Sidebar
        notes={filteredNotes}
        activeNoteId={vault.activeNoteId}
        searchQuery={searchQuery}
        tags={tags}
        activeTag={activeTag}
        syncing={syncing}
        siyuanSync={siyuanSync}
        onAddNote={() => {
          const id = addNote();
          setActiveNote(id);
        }}
        onSelectNote={setActiveNote}
        onSearchChange={setSearchQuery}
        onTagSelect={setActiveTag}
        onDeleteNote={(id) => {
          deleteNote(id);
          showToast('Note deleted');
        }}
        onToggleSync={toggleSiyuanSync}
      />

      <div className="noteforge-main">
        <div className="noteforge-toolbar">
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setView('editor')}
              className={'nf-toolbar-btn' + (view === 'editor' ? ' active' : '')}
            >
              {'\u270F\uFE0F'} Editor
            </button>
            <button
              onClick={() => setView('graph')}
              className={'nf-toolbar-btn' + (view === 'graph' ? ' active' : '')}
            >
              {'\uD83D\uDD78\uFE0F'} Graph
            </button>
            <button
              onClick={() => setView('erp')}
              className={'nf-toolbar-btn' + (view === 'erp' ? ' active' : '')}
            >
              {'\uD83D\uDCCA'} ERP {erpConnected ? '\uD83D\uDFE2' : '\uD83D\uDD34'}
            </button>
            <button
              onClick={() => setView('erp-settings')}
              className={'nf-toolbar-btn' + (view === 'erp-settings' ? ' active' : '')}
            >
              {'\u2699\uFE0F'} ERP Settings
            </button>
          </div>
          <div className="nf-toolbar-info">
            <span>{Object.keys(vault.notes).length} notes</span>
            <span>Ctrl+P to search</span>
          </div>
        </div>

        {view === 'editor' && (
          <Editor
            note={activeNote}
            onUpdate={updateNote}
            onNavigate={handleNavigateToNote}
          />
        )}
        {view === 'graph' && (
          <GraphView
            nodes={graphData.nodes}
            links={graphData.links}
            activeNoteId={vault.activeNoteId}
            onSelectNote={setActiveNote}
          />
        )}
        {view === 'erp' && (
          <ErpDashboard />
        )}
        {view === 'erp-settings' && (
          <ErpSettings onConnected={() => {
            const cfg = loadErpConfig();
            setErpConnected(!!(cfg.tenantId && cfg.token));
            setView('erp');
          }} />
        )}
      </div>

      <SearchDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        notes={Object.values(vault.notes)}
        onSelect={setActiveNote}
      />

      {toasts.length > 0 && (
        <div className="nf-toast-container">
          {toasts.map((msg, i) => (
            <div key={i} className="nf-toast">{msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
