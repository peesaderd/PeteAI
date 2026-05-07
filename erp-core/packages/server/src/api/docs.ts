// ============================================================
// Docs API Routes — serve documentation as REST API + HTML UI
// ============================================================

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Docs root is <repo-root>/docs
const DOCS_ROOT = path.resolve(__dirname, '../../../../docs');

interface DocEntry {
  slug: string;
  title: string;
  description: string;
  content: string;
  updatedAt: string;
}

function parseTitle(content: string): string {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : 'Untitled';
}

function parseDescription(content: string): string {
  // Take first paragraph after title
  const afterTitle = content.replace(/^#\s+.+\n+/, '');
  const match = afterTitle.match(/^(.+?)(?:\n\n|\n#|$)/s);
  if (match) {
    return match[1].trim().replace(/\n/g, ' ').slice(0, 200);
  }
  return '';
}

function loadDocs(): DocEntry[] {
  const docs: DocEntry[] = [];
  if (!fs.existsSync(DOCS_ROOT)) return docs;

  const files = fs.readdirSync(DOCS_ROOT)
    .filter(f => f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const filePath = path.join(DOCS_ROOT, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    const slug = file.replace(/\.md$/, '');

    docs.push({
      slug,
      title: parseTitle(content),
      description: parseDescription(content),
      content,
      updatedAt: stat.mtime.toISOString(),
    });
  }

  return docs;
}

export function createDocsRouter() {
  const router = Router();

  // GET /api/docs — list all docs (metadata only, no content)
  router.get('/', (_req: Request, res: Response) => {
    const docs = loadDocs().map(({ content, ...meta }) => ({
      ...meta,
      content: content.slice(0, 500), // preview only
    }));
    res.json(docs);
  });

  // GET /api/docs/:slug — get full doc content
  router.get('/:slug', (req: Request, res: Response) => {
    const docs = loadDocs();
    const doc = docs.find(d => d.slug === req.params.slug);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  });

  // GET /api/docs/html/:slug — render doc as HTML page
  router.get('/html/:slug', (req: Request, res: Response) => {
    const docs = loadDocs();
    const doc = docs.find(d => d.slug === req.params.slug);
    if (!doc) return res.status(404).send('<h1>404 — Document not found</h1>');

    const html = renderDocPage(docs, doc);
    res.type('html').send(html);
  });

  // GET /api/docs/html — render docs index as HTML page
  router.get('/html', (_req: Request, res: Response) => {
    const docs = loadDocs();
    const html = renderDocsIndex(docs);
    res.type('html').send(html);
  });

  return router;
}

// ─── HTML renderers ──────────────────────────────────────────

function renderDocsIndex(docs: DocEntry[]): string {
  const cards = docs.map(d => `
    <a href="/api/docs/html/${d.slug}" class="card">
      <h2>${escapeHtml(d.title)}</h2>
      <p>${escapeHtml(d.description)}</p>
      <span class="meta">Updated: ${new Date(d.updatedAt).toLocaleDateString()}</span>
    </a>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERP Core — Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      color: white;
      padding: 3rem 2rem;
      text-align: center;
    }
    .header h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    .header p { opacity: 0.8; font-size: 1.1rem; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      flex-direction: column;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
    .card h2 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #1a1a2e; }
    .card p { font-size: 0.9rem; color: #666; flex: 1; }
    .card .meta { font-size: 0.8rem; color: #999; margin-top: 1rem; }
    .footer { text-align: center; padding: 2rem; color: #999; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📚 ERP Core Documentation</h1>
    <p>Test & QA Pipeline — System Documentation</p>
  </div>
  <div class="container">
    <div class="cards">${cards}</div>
  </div>
  <div class="footer">
    ERP Core — Built with ❤️ | <a href="/api/docs/html">Docs API</a>
  </div>
</body>
</html>`;
}

function renderDocPage(allDocs: DocEntry[], doc: DocEntry): string {
  const sidebar = allDocs.map(d => `
    <li${d.slug === doc.slug ? ' class="active"' : ''}>
      <a href="/api/docs/html/${d.slug}">${escapeHtml(d.title)}</a>
    </li>
  `).join('\n');

  const contentHtml = renderMarkdown(doc.content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.title)} — ERP Core Docs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
      line-height: 1.6;
    }
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 260px;
      background: #1a1a2e;
      color: white;
      padding: 1.5rem;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar h2 { font-size: 1rem; opacity: 0.6; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .sidebar ul { list-style: none; }
    .sidebar li { margin-bottom: 0.25rem; }
    .sidebar a {
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      font-size: 0.9rem;
      padding: 0.4rem 0.75rem;
      display: block;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .sidebar a:hover { background: rgba(255,255,255,0.1); color: white; }
    .sidebar li.active a { background: rgba(255,255,255,0.15); color: white; font-weight: 600; }
    .content {
      flex: 1;
      padding: 2.5rem 3rem;
      max-width: 900px;
    }
    .content h1 { font-size: 2rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e0e0e0; }
    .content h2 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.75rem; }
    .content h3 { font-size: 1.2rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .content p { margin-bottom: 1rem; }
    .content ul, .content ol { margin-bottom: 1rem; padding-left: 1.5rem; }
    .content li { margin-bottom: 0.25rem; }
    .content code {
      background: #e8e8ed;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .content pre {
      background: #1d1d1f;
      color: #f5f5f7;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    .content pre code { background: none; padding: 0; color: inherit; }
    .content table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    .content th, .content td { padding: 0.5rem 0.75rem; border: 1px solid #e0e0e0; text-align: left; }
    .content th { background: #f0f0f2; font-weight: 600; }
    .content blockquote {
      border-left: 4px solid #1a1a2e;
      padding-left: 1rem;
      margin-left: 0;
      color: #666;
    }
    .meta-bar {
      font-size: 0.85rem;
      color: #999;
      margin-bottom: 2rem;
    }
    @media (max-width: 768px) {
      .layout { flex-direction: column; }
      .sidebar { width: 100%; height: auto; position: static; }
      .content { padding: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <nav class="sidebar">
      <h2>📚 Docs</h2>
      <ul>${sidebar}</ul>
    </nav>
    <main class="content">
      <h1>${escapeHtml(doc.title)}</h1>
      <div class="meta-bar">Updated: ${new Date(doc.updatedAt).toLocaleDateString()}</div>
      <div class="markdown">${contentHtml}</div>
    </main>
  </div>
</body>
</html>`;
}

// ─── Simple Markdown renderer ────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Tables (simple)
  html = html.replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (_m, header, rows) => {
    const headers = header.split('|').filter((h: string) => h.trim()).map((h: string) => `<th>${h.trim()}</th>`).join('');
    const rowHtml = rows.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rowHtml}</tbody></table>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs — wrap remaining lines
  const lines = html.split('\n');
  const result: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { inBlock = false; continue; }

    if (trimmed.startsWith('<h') || trimmed.startsWith('<pre') || trimmed.startsWith('<ul') ||
        trimmed.startsWith('<li') || trimmed.startsWith('<table') || trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<hr') || trimmed.startsWith('</')) {
      result.push(trimmed);
      inBlock = false;
    } else if (trimmed.startsWith('<')) {
      result.push(trimmed);
      inBlock = false;
    } else {
      if (!inBlock) {
        result.push(`<p>${trimmed}</p>`);
      } else {
        result.push(`${trimmed}<br>`);
      }
      inBlock = true;
    }
  }

  return result.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
