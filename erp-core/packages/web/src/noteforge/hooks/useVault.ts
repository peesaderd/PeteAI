import { useState, useCallback, useEffect, useRef } from 'react';
import { Note, Vault, GraphNode, GraphLink } from '../types';
import { loadVault, saveVault, createNote, generateId, extractLinks, extractTags } from '../utils/storage';
import { fetchAllDocs, createSiYuanDoc, updateSiYuanDoc, deleteSiYuanDoc, SiYuanDoc } from '../utils/siyuanApi';

const SYNC_KEY = noteforge-siyuan-sync;

function getSyncEnabled(): boolean {
  try { return localStorage.getItem(SYNC_KEY) === true; } catch { return false; }
}

function setSyncEnabled(val: boolean) {
  try { localStorage.setItem(SYNC_KEY, val ? true : false); } catch {}
}

function siyuanToNote(doc: SiYuanDoc): Note {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    tags: doc.tags,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    links: doc.links,
  };
}

function noteToSiYuan(note: Note): { title: string; content: string; tags: string[] } {
  return {
    title: note.title,
    content: note.content,
    tags: note.tags,
  };
}

export function useVault() {
  const [vault, setVault] = useState<Vault>(() => loadVault());
  const [searchQuery, setSearchQuery] = useState();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [siyuanSync, setSiyuanSync] = useState(() => getSyncEnabled());
  const syncRef = useRef(false);

  // Auto-save to localStorage
  useEffect(() => {
    saveVault(vault);
  }, [vault]);

  // Sync from SiYuan on first load if enabled
  useEffect(() => {
    if (siyuanSync && !syncRef.current) {
      syncRef.current = true;
      syncFromSiYuan();
    }
  }, [siyuanSync]);

  async function syncFromSiYuan() {
    setSyncing(true);
    try {
      const docs = await fetchAllDocs();
      if (docs.length === 0) return;
      const notes: Record<string, Note> = {};
      const rootIds: string[] = [];
      for (const doc of docs) {
        notes[doc.id] = siyuanToNote(doc);
        rootIds.push(doc.id);
      }
      setVault(prev => ({
        notes,
        rootIds,
        activeNoteId: prev.activeNoteId && notes[prev.activeNoteId] ? prev.activeNoteId : rootIds[0] || null,
      }));
    } catch (e) {
      console.error('SiYuan sync error:', e);
    } finally {
      setSyncing(false);
    }
  }

  const activeNote = vault.activeNoteId ? vault.notes[vault.activeNoteId] : null;

  const addNote = useCallback(async (title = Untitled) => {
    let noteId = generateId();
    if (siyuanSync) {
      const siyuanId = await createSiYuanDoc(title);
      if (siyuanId) noteId = siyuanId;
    }
    const note = createNote(title);
    note.id = noteId;
    setVault(prev => ({
      ...prev,
      notes: { ...prev.notes, [note.id]: note },
      rootIds: [...prev.rootIds, note.id],
      activeNoteId: note.id,
    }));
    return note.id;
  }, [siyuanSync]);

  const updateNote = useCallback(async (id: string, updates: Partial<Note>) => {
    setVault(prev => {
      const note = prev.notes[id];
      if (!note) return prev;
      const updated = {
        ...note,
        ...updates,
        updatedAt: Date.now(),
      };
      if (updates.content !== undefined) {
        updated.links = extractLinks(updates.content);
        updated.tags = extractTags(updates.content);
      }
      // Sync to SiYuan in background
      if (siyuanSync && id.length > 20) { // SiYuan IDs are long
        updateSiYuanDoc(id, updated.content, updated.title, updated.tags).catch(console.error);
      }
      return {
        ...prev,
        notes: { ...prev.notes, [id]: updated },
      };
    });
  }, [siyuanSync]);

  const deleteNote = useCallback(async (id: string) => {
    if (siyuanSync && id.length > 20) {
      await deleteSiYuanDoc(id).catch(console.error);
    }
    setVault(prev => {
      const { [id]: removed, ...rest } = prev.notes;
      const cleaned: Record<string, Note> = {};
      for (const [nid, note] of Object.entries(rest)) {
        cleaned[nid] = {
          ...note,
          links: note.links.filter(l => l !== id),
        };
      }
      return {
        notes: cleaned,
        rootIds: prev.rootIds.filter(rid => rid !== id),
        activeNoteId: prev.activeNoteId === id
          ? (prev.rootIds.filter(rid => rid !== id)[0] || null)
          : prev.activeNoteId,
      };
    });
  }, [siyuanSync]);

  const setActiveNote = useCallback((id: string | null) => {
    setVault(prev => ({ ...prev, activeNoteId: id }));
  }, []);

  const toggleSiyuanSync = useCallback(async (enabled: boolean) => {
    setSyncEnabled(enabled);
    setSiyuanSync(enabled);
    if (enabled) {
      await syncFromSiYuan();
    }
  }, []);

  const getFilteredNotes = useCallback(() => {
    let notes = Object.values(vault.notes);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (activeTag) {
      notes = notes.filter(n => n.tags.includes(activeTag));
    }
    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [vault.notes, searchQuery, activeTag]);

  const getAllTags = useCallback(() => {
    const tagMap = new Map<string, number>();
    for (const note of Object.values(vault.notes)) {
      for (const tag of note.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [vault.notes]);

  const getGraphData = useCallback((): { nodes: GraphNode[]; links: GraphLink[] } => {
    const notes = Object.values(vault.notes);
    const nodes: GraphNode[] = notes.map(n => ({
      id: n.id,
      title: n.title,
      tags: n.tags,
    }));
    const links: GraphLink[] = [];
    const titleToId = new Map(notes.map(n => [n.title, n.id]));
    for (const note of notes) {
      for (const linkTitle of note.links) {
        const targetId = titleToId.get(linkTitle);
        if (targetId && targetId !== note.id) {
          links.push({ source: note.id, target: targetId });
        }
      }
    }
    return { nodes, links };
  }, [vault.notes]);

  return {
    vault,
    activeNote,
    searchQuery,
    setSearchQuery,
    activeTag,
    setActiveTag,
    syncing,
    siyuanSync,
    toggleSiyuanSync,
    addNote,
    updateNote,
    deleteNote,
    setActiveNote,
    getFilteredNotes,
    getAllTags,
    getGraphData,
  };
}
