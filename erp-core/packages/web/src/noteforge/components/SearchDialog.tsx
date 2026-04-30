import { useState, useEffect, useRef } from 'react';
import { Note } from '../types';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onSelect: (id: string) => void;
}

export function SearchDialog({ isOpen, onClose, notes, onSelect }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = query
    ? notes.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.content.toLowerCase().includes(query.toLowerCase()) ||
        n.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 10)
    : notes.slice(0, 10);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      onSelect(results[selectedIdx].id);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function highlightMatch(text: string): JSX.Element {
    if (!query) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <span className="result-highlight">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-dialog" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search notes..."
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
          onKeyDown={handleKeyDown}
        />
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">No notes found</div>
          ) : (
            results.map((note, i) => (
              <div
                key={note.id}
                className={`search-result-item ${i === selectedIdx ? 'selected' : ''}`}
                onClick={() => { onSelect(note.id); onClose(); }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <div className="result-title">{highlightMatch(note.title || 'Untitled')}</div>
                <div className="result-preview">
                  {highlightMatch(note.content.replace(/[#*[\]>|]/g, '').slice(0, 100))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
