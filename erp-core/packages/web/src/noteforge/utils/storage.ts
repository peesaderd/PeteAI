import { Note, Vault } from '../types';

const STORAGE_KEY = 'noteforge-vault';

const DEFAULT_VAULT: Vault = {
  notes: {},
  rootIds: [],
  activeNoteId: null,
};

export function loadVault(): Vault {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load vault:', e);
  }
  return { ...DEFAULT_VAULT };
}

export function saveVault(vault: Vault): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  } catch (e) {
    console.error('Failed to save vault:', e);
  }
}

export function createNote(title: string, content: string = '', tags: string[] = []): Note {
  const id = generateId();
  return {
    id,
    title,
    content,
    tags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    links: [],
  };
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function extractLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

export function extractTags(content: string): string[] {
  const tagRegex = /#([\w\u0e00-\u0e7f-]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    if (!tags.includes(match[1])) {
      tags.push(match[1]);
    }
  }
  return tags;
}
