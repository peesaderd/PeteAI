import { useState, useCallback, useEffect } from 'react';
import { Note, Vault, GraphNode, GraphLink } from '../types';
import { loadVault, saveVault, createNote, generateId, extractLinks, extractTags } from '../utils/storage';

export function useVault() {
  const [vault, setVault] = useState<Vault>(() => loadVault());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    saveVault(vault);
  }, [vault]);

  const activeNote = vault.activeNoteId ? vault.notes[vault.activeNoteId] : null;

  const addNote = useCallback((title = 'Untitled') => {
    const note = createNote(title);
    setVault(prev => ({
      ...prev,
      notes: { ...prev.notes, [note.id]: note },
      rootIds: [...prev.rootIds, note.id],
      activeNoteId: note.id,
    }));
    return note.id;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
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
      return {
        ...prev,
        notes: { ...prev.notes, [id]: updated },
      };
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setVault(prev => {
      const { [id]: removed, ...rest } = prev.notes;
      // Remove links to this note
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
  }, []);

  const setActiveNote = useCallback((id: string | null) => {
    setVault(prev => ({ ...prev, activeNoteId: id }));
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
    const idToTitle = new Map(notes.map(n => [n.id, n.title]));
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
    addNote,
    updateNote,
    deleteNote,
    setActiveNote,
    getFilteredNotes,
    getAllTags,
    getGraphData,
  };
}
