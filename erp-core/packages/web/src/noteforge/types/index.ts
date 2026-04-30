export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  links: string[]; // IDs of linked notes
  isFolder?: boolean;
  children?: string[];
  parentId?: string;
}

export interface Vault {
  notes: Record<string, Note>;
  rootIds: string[];
  activeNoteId: string | null;
}

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
}

export interface GraphLink {
  source: string;
  target: string;
}
