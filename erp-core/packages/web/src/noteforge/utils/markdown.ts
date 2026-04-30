export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getNoteTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

export function getNotePreview(content: string, maxLength: number = 150): string {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
  const plain = withoutFrontmatter
    .replace(/^#+\s+(.+)$/gm, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/#(\w+)/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .trim();
  return plain.length > maxLength ? plain.slice(0, maxLength) + '...' : plain;
}
