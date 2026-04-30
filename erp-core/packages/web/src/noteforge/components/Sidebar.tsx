import { useState } from 'react';
import { Note } from '../types';
import { formatDate, getNotePreview } from '../utils/markdown';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string | null;
  searchQuery: string;
  tags: { name: string; count: number }[];
  activeTag: string | null;
  onAddNote: () => void;
  onSelectNote: (id: string) => void;
  onSearchChange: (q: string) => void;
  onTagSelect: (tag: string | null) => void;
  onDeleteNote: (id: string) => void;
}

export function Sidebar({
  notes, activeNoteId, searchQuery, tags, activeTag,
  onAddNote, onSelectNote, onSearchChange, onTagSelect, onDeleteNote,
}: SidebarProps) {
  const [view, setView] = useState<'files' | 'tags'>('files');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);

  function handleContextMenu(e: React.MouseEvent, noteId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-icon">N</div>
          <h1>NoteForge</h1>
        </div>
        <div className="sidebar-actions">
          <button onClick={onAddNote} title="New note (Ctrl+N)">+</button>
        </div>
      </div>

      <div className="sidebar-search">
        <span className="search-icon">⌕</span>
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: '2px', padding: '0 12px 8px' }}>
        <button
          onClick={() => setView('files')}
          style={{
            flex: 1, padding: '4px 0', fontSize: '12px', fontWeight: view === 'files' ? 600 : 400,
            background: view === 'files' ? 'var(--bg-surface)' : 'none',
            border: 'none', borderRadius: '4px', color: view === 'files' ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          📄 Files
        </button>
        <button
          onClick={() => setView('tags')}
          style={{
            flex: 1, padding: '4px 0', fontSize: '12px', fontWeight: view === 'tags' ? 600 : 400,
            background: view === 'tags' ? 'var(--bg-surface)' : 'none',
            border: 'none', borderRadius: '4px', color: view === 'tags' ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          🏷️ Tags
        </button>
      </div>

      <div className="note-list">
        {view === 'files' ? (
          notes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>No notes yet. Click + to create one.</p>
            </div>
          ) : (
            notes.map(note => (
              <div
                key={note.id}
                className={`note-item ${note.id === activeNoteId ? 'active' : ''}`}
                onClick={() => onSelectNote(note.id)}
                onContextMenu={e => handleContextMenu(e, note.id)}
              >
                <div className="note-title">{note.title || 'Untitled'}</div>
                <div className="note-meta">
                  <span className="note-date">{formatDate(note.updatedAt)}</span>
                  {note.tags.length > 0 && (
                    <div className="note-tags">
                      {note.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="note-tag">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="note-preview">{getNotePreview(note.content, 80)}</div>
              </div>
            ))
          )
        ) : (
          <>
            {activeTag && (
              <div style={{ padding: '4px 10px 8px' }}>
                <button
                  onClick={() => onTagSelect(null)}
                  style={{
                    fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-surface)',
                    border: 'none', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer',
                  }}
                >
                  ✕ Clear filter
                </button>
              </div>
            )}
            {tags.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏷️</div>
                <p>No tags yet. Use #tag in your notes.</p>
              </div>
            ) : (
              tags.map(tag => (
                <div
                  key={tag.name}
                  className="tag-item"
                  onClick={() => onTagSelect(tag.name === activeTag ? null : tag.name)}
                  style={tag.name === activeTag ? { background: 'var(--bg-surface)', color: 'var(--text-primary)' } : {}}
                >
                  <span className="tag-dot" />
                  <span>#{tag.name}</span>
                  <span className="tag-count">{tag.count}</span>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199 }}
            onClick={() => setContextMenu(null)}
          />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div
              className="context-menu-item danger"
              onClick={() => {
                onDeleteNote(contextMenu.noteId);
                setContextMenu(null);
              }}
            >
              🗑️ Delete note
            </div>
          </div>
        </>
      )}
    </div>
  );
}
