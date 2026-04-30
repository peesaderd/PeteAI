import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Note } from '../types';
import { parseErpEmbeds, resolveErpEmbed, getErpConfig } from '../utils/erpApi';

interface EditorProps {
  note: Note | null;
  onUpdate: (id: string, updates: Partial<Note>) => void;
  onNavigate: (title: string) => void;
}

export function Editor({ note, onUpdate, onNavigate }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [erpResolved, setErpResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    } else {
      setTitle('');
      setContent('');
    }
    setErpResolved({});
  }, [note?.id]);

  // Resolve ERP embeds (!erp.xxx) in preview mode
  useEffect(() => {
    const cfg = getErpConfig();
    if (!cfg.tenantId || !cfg.token || viewMode === 'edit') {
      setErpResolved({});
      return;
    }
    const embeds = parseErpEmbeds(content);
    if (embeds.length === 0) {
      setErpResolved({});
      return;
    }
    let cancelled = false;
    async function resolveAll() {
      const results: Record<string, string> = {};
      for (const embed of embeds) {
        if (cancelled) return;
        try {
          results[embed.raw] = await resolveErpEmbed(embed);
        } catch {
          results[embed.raw] = `*Error loading ${embed.type}*`;
        }
      }
      if (!cancelled) setErpResolved(results);
    }
    resolveAll();
    return () => { cancelled = true; };
  }, [content, viewMode]);

  const scheduleSave = useCallback((id: string, updates: { title?: string; content?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(id, updates);
    }, 300);
  }, [onUpdate]);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (note) scheduleSave(note.id, { title: value, content });
  }

  function handleContentChange(value: string) {
    setContent(value);
    if (note) scheduleSave(note.id, { content: value, title });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (note) {
        onUpdate(note.id, { title, content });
      }
    }
  }

  function insertMarkdown(before: string, after = '') {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const newContent = content.substring(0, start) + before + selected + after + content.substring(end);
    setContent(newContent);
    if (note) scheduleSave(note.id, { content: newContent, title });
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  }

  // Custom renderer for wikilinks and ERP embeds
  function renderMarkdown() {
    // Replace ERP embeds with resolved content
    let processed = content;
    if (Object.keys(erpResolved).length > 0) {
      for (const [raw, resolved] of Object.entries(erpResolved)) {
        processed = processed.replace(raw, `\n${resolved}\n`);
      }
    }
    processed = processed.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
      return `<a href="#" class="wikilink" data-note="${title}">${title}</a>`;
    });
    // Render tags as styled spans
    const withTags = processed.replace(/#([\w\u0e00-\u0e7f-]+)/g, (_, tag) => {
      return `<span class="tag">#${tag}</span>`;
    });
    return withTags;
  }

  if (!note) {
    return (
      <div className="welcome-screen">
        <div className="welcome-icon">⚒️</div>
        <h2>Welcome to NoteForge</h2>
        <p>A private, local-first note-taking app inspired by Obsidian. Your notes are stored safely in your browser.</p>
        <div className="shortcuts">
          <div className="shortcut"><kbd>Ctrl+N</kbd> Create a new note</div>
          <div className="shortcut"><kbd>Ctrl+P</kbd> Search notes</div>
          <div className="shortcut"><kbd>Ctrl+S</kbd> Save note</div>
          <div className="shortcut"><kbd>[[title]]</kbd> Link to another note</div>
          <div className="shortcut"><kbd>#tag</kbd> Add a tag</div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        <button onClick={() => insertMarkdown('**', '**')} title="Bold">B</button>
        <button onClick={() => insertMarkdown('*', '*')} title="Italic"><em>I</em></button>
        <button onClick={() => insertMarkdown('~~', '~~')} title="Strikethrough">S</button>
        <div className="toolbar-divider" />
        <button onClick={() => insertMarkdown('# ')} title="Heading">H</button>
        <button onClick={() => insertMarkdown('```\n', '\n```')} title="Code">&lt;/&gt;</button>
        <button onClick={() => insertMarkdown('> ')} title="Quote">❝</button>
        <button onClick={() => insertMarkdown('- ')} title="List">≡</button>
        <button onClick={() => insertMarkdown('[', '](url)')} title="Link">🔗</button>
        <div className="toolbar-divider" />
        <button onClick={() => insertMarkdown('[[', ']]')} title="Wiki Link">⤻</button>
        <div className="view-toggle">
          <button className={viewMode === 'edit' ? 'active' : ''} onClick={() => setViewMode('edit')}>Edit</button>
          <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>Preview</button>
          <button className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')}>Split</button>
        </div>
      </div>

      <div className="editor-scroll" style={{ display: viewMode === 'preview' ? 'flex' : 'flex' }}>
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className="editor-pane" style={viewMode === 'split' ? { maxWidth: '50%' } : {}}>
            <input
              className="editor-title-input"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Note title..."
              onKeyDown={handleKeyDown}
            />
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Start writing... Use #tags and [[links]] to connect ideas."
            />
          </div>
        )}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="markdown-preview" style={viewMode === 'split' ? { maxWidth: '50%', borderLeft: '1px solid var(--border)', paddingLeft: 20 } : {}}>
            <h1>{title}</h1>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith('#')) {
                    return <span className="tag">{children}</span>;
                  }
                  return <a href={href}>{children}</a>;
                },
              }}
            >
              {renderMarkdown()}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
