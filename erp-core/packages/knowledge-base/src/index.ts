// ============================================================
// Knowledge Base Server (Obsidian Alternative)
// Full-featured wiki with MCP protocol + REST API
// ============================================================

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { marked } from 'marked';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3100', 10);
const DB_PATH = process.env.KB_DB_PATH || './data/knowledge-base.db';
const DATA_DIR = process.env.KB_DATA_DIR || './data/kb-files';

// ============================================================
// Database Setup
// ============================================================

function initDB(): Database.Database {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '📁',
      color TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      collection_id TEXT REFERENCES collections(id),
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      content_html TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      word_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_docs_collection ON documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_docs_updated ON documents(updated_at);

    CREATE TABLE IF NOT EXISTS document_links (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES documents(id),
      target_id TEXT NOT NULL REFERENCES documents(id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}

// ============================================================
// MCP Tools
// ============================================================

function tool(name: string, description: string, schema: z.ZodObject<any>) {
  return { name, description, inputSchema: zodToJsonSchema(schema) };
}

const TOOLS = [
  tool('kb_list_collections', 'List all collections', z.object({})),
  tool('kb_create_collection', 'Create a collection', z.object({
    name: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })),
  tool('kb_list_documents', 'List documents', z.object({
    collectionId: z.string().optional(),
    search: z.string().optional(),
    tag: z.string().optional(),
    limit: z.number().optional(),
  })),
  tool('kb_get_document', 'Get document with content', z.object({
    documentId: z.string(),
  })),
  tool('kb_create_document', 'Create document', z.object({
    collectionId: z.string(),
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()).optional(),
  })),
  tool('kb_update_document', 'Update document', z.object({
    documentId: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })),
  tool('kb_delete_document', 'Delete document', z.object({
    documentId: z.string(),
  })),
  tool('kb_search', 'Full-text search documents', z.object({
    query: z.string(),
    limit: z.number().optional(),
  })),
  tool('kb_get_graph', 'Get document graph (links between docs)', z.object({})),
  tool('kb_get_stats', 'Get knowledge base statistics', z.object({})),
];

// ============================================================
// Server
// ============================================================

function createApp(db: Database.Database) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ---- REST API ----

  // Collections
  app.get('/api/collections', (_req, res) => {
    const collections = db.prepare('SELECT * FROM collections ORDER BY sort_order').all();
    res.json(collections);
  });

  app.post('/api/collections', (req, res) => {
    const { name, description, icon } = req.body;
    const now = Math.floor(Date.now() / 1000);
    const id = uuid();
    db.prepare('INSERT INTO collections (id, name, description, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, description || null, icon || '📁', now, now);
    res.json(db.prepare('SELECT * FROM collections WHERE id = ?').get(id));
  });

  app.put('/api/collections/:id', (req, res) => {
    const { name, description, icon, sortOrder } = req.body;
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (icon !== undefined) { updates.push('icon = ?'); params.push(icon); }
    if (sortOrder !== undefined) { updates.push('sort_order = ?'); params.push(sortOrder); }
    params.push(req.params.id);
    db.prepare(`UPDATE collections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json(db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/collections/:id', (req, res) => {
    db.prepare('DELETE FROM documents WHERE collection_id = ?').run(req.params.id);
    db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Documents
  app.get('/api/documents', (req, res) => {
    const { collectionId, search, tag, limit = 50 } = req.query;
    let sql = 'SELECT id, collection_id, title, tags, is_published, is_favorite, word_count, created_at, updated_at FROM documents WHERE 1=1';
    const params: any[] = [];

    if (collectionId) { sql += ' AND collection_id = ?'; params.push(collectionId); }
    if (search) { sql += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (tag) { sql += ' AND tags LIKE ?'; params.push(`%"${tag}"%`); }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(Number(limit));

    const docs = db.prepare(sql).all(...params);
    res.json(docs);
  });

  app.get('/api/documents/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  });

  app.post('/api/documents', (req, res) => {
    const { collectionId, title, content, tags } = req.body;
    const now = Math.floor(Date.now() / 1000);
    const id = uuid();
    const contentHtml = marked.parse(content || '') as string;
    const wordCount = (content || '').split(/\s+/).filter(Boolean).length;

    db.prepare(`INSERT INTO documents (id, collection_id, title, content, content_html, tags, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, collectionId, title, content || '', contentHtml, JSON.stringify(tags || []), wordCount, now, now);

    // Extract [[wiki links]] and create relationships
    const links = content?.match(/\[\[(.+?)\]\]/g) || [];
    links.forEach((link: string) => {
      const linkTitle = link.slice(2, -2);
      const target = db.prepare('SELECT id FROM documents WHERE title = ?').get(linkTitle) as any;
      if (target) {
        db.prepare('INSERT INTO document_links (id, source_id, target_id, created_at) VALUES (?, ?, ?, ?)')
          .run(uuid(), id, target.id, now);
      }
    });

    res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(id));
  });

  app.put('/api/documents/:id', (req, res) => {
    const { title, content, tags, isPublished, isFavorite } = req.body;
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (content !== undefined) {
      updates.push('content = ?', 'content_html = ?', 'word_count = ?');
      params.push(content, marked.parse(content) as string, content.split(/\s+/).filter(Boolean).length);
    }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (isPublished !== undefined) { updates.push('is_published = ?'); params.push(isPublished ? 1 : 0); }
    if (isFavorite !== undefined) { updates.push('is_favorite = ?'); params.push(isFavorite ? 1 : 0); }

    params.push(req.params.id);
    db.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/documents/:id', (req, res) => {
    db.prepare('DELETE FROM document_links WHERE source_id = ? OR target_id = ?').run(req.params.id, req.params.id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Search
  app.get('/api/search', (req, res) => {
    const { q, limit = 20 } = req.query;
    if (!q) return res.json([]);
    const docs = db.prepare(
      'SELECT id, collection_id, title, tags, created_at, updated_at FROM documents WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT ?'
    ).all(`%${q}%`, `%${q}%`, Number(limit));
    res.json(docs);
  });

  // Graph
  app.get('/api/graph', (_req, res) => {
    const nodes = db.prepare('SELECT id, title, collection_id FROM documents').all();
    const edges = db.prepare('SELECT source_id, target_id FROM document_links').all();
    res.json({ nodes, edges });
  });

  // Stats
  app.get('/api/stats', (_req, res) => {
    const docCount = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as any).count;
    const colCount = (db.prepare('SELECT COUNT(*) as count FROM collections').get() as any).count;
    const linkCount = (db.prepare('SELECT COUNT(*) as count FROM document_links').get() as any).count;
    const totalWords = (db.prepare('SELECT SUM(word_count) as total FROM documents').get() as any).total || 0;
    const recentDocs = db.prepare('SELECT id, title, updated_at FROM documents ORDER BY updated_at DESC LIMIT 10').all();
    res.json({ documents: docCount, collections: colCount, links: linkCount, totalWords, recentDocuments: recentDocs });
  });

  // Export
  app.get('/api/export/:id/markdown', (req, res) => {
    const doc = db.prepare('SELECT title, content FROM documents WHERE id = ?').get(req.params.id) as any;
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.title}.md"`);
    res.send(doc.content);
  });

  // Serve web UI
  const webDir = path.join(import.meta.dirname, '../web');
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  return app;
}

// ============================================================
// MCP Server
// ============================================================

function createMCPServer(db: Database.Database) {
  const server = new Server(
    { name: 'knowledge-base', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = args as Record<string, any>;
    const now = Math.floor(Date.now() / 1000);

    try {
      switch (name) {
        case 'kb_list_collections': {
          const collections = db.prepare('SELECT * FROM collections ORDER BY sort_order').all();
          return { content: [{ type: 'text', text: JSON.stringify(collections, null, 2) }] };
        }

        case 'kb_create_collection': {
          const id = uuid();
          db.prepare('INSERT INTO collections (id, name, description, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(id, params.name, params.description || null, params.icon || '📁', now, now);
          const col = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
          return { content: [{ type: 'text', text: JSON.stringify(col, null, 2) }] };
        }

        case 'kb_list_documents': {
          const { collectionId, search, tag, limit = 50 } = params;
          let sql = 'SELECT id, collection_id, title, tags, is_published, is_favorite, word_count, created_at, updated_at FROM documents WHERE 1=1';
          const queryParams: any[] = [];
          if (collectionId) { sql += ' AND collection_id = ?'; queryParams.push(collectionId); }
          if (search) { sql += ' AND (title LIKE ? OR content LIKE ?)'; queryParams.push(`%${search}%`, `%${search}%`); }
          if (tag) { sql += ' AND tags LIKE ?'; queryParams.push(`%"${tag}"%`); }
          sql += ' ORDER BY updated_at DESC LIMIT ?';
          queryParams.push(limit);
          const docs = db.prepare(sql).all(...queryParams);
          return { content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }] };
        }

        case 'kb_get_document': {
          const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(params.documentId);
          if (!doc) throw new Error('Document not found');
          return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
        }

        case 'kb_create_document': {
          const id = uuid();
          const contentHtml = marked.parse(params.content || '') as string;
          const wordCount = (params.content || '').split(/\s+/).filter(Boolean).length;
          db.prepare(`INSERT INTO documents (id, collection_id, title, content, content_html, tags, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, params.collectionId, params.title, params.content || '', contentHtml, JSON.stringify(params.tags || []), wordCount, now, now);
          const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
          return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
        }

        case 'kb_update_document': {
          const { documentId, ...fields } = params;
          const updates: string[] = ['updated_at = ?'];
          const queryParams: any[] = [now];
          if (fields.title !== undefined) { updates.push('title = ?'); queryParams.push(fields.title); }
          if (fields.content !== undefined) {
            updates.push('content = ?', 'content_html = ?', 'word_count = ?');
            queryParams.push(fields.content, marked.parse(fields.content) as string, fields.content.split(/\s+/).filter(Boolean).length);
          }
          if (fields.tags !== undefined) { updates.push('tags = ?'); queryParams.push(JSON.stringify(fields.tags)); }
          queryParams.push(documentId);
          db.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).run(...queryParams);
          const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
          return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
        }

        case 'kb_delete_document': {
          db.prepare('DELETE FROM document_links WHERE source_id = ? OR target_id = ?').run(params.documentId, params.documentId);
          db.prepare('DELETE FROM documents WHERE id = ?').run(params.documentId);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
        }

        case 'kb_search': {
          const docs = db.prepare('SELECT id, collection_id, title, tags, created_at, updated_at FROM documents WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT ?')
            .all(`%${params.query}%`, `%${params.query}%`, params.limit || 20);
          return { content: [{ type: 'text', text: JSON.stringify(docs, null, 2) }] };
        }

        case 'kb_get_graph': {
          const nodes = db.prepare('SELECT id, title, collection_id FROM documents').all();
          const edges = db.prepare('SELECT source_id, target_id FROM document_links').all();
          return { content: [{ type: 'text', text: JSON.stringify({ nodes, edges }, null, 2) }] };
        }

        case 'kb_get_stats': {
          const docCount = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as any).count;
          const colCount = (db.prepare('SELECT COUNT(*) as count FROM collections').get() as any).count;
          const linkCount = (db.prepare('SELECT COUNT(*) as count FROM document_links').get() as any).count;
          const totalWords = (db.prepare('SELECT SUM(word_count) as total FROM documents').get() as any).total || 0;
          return { content: [{ type: 'text', text: JSON.stringify({ documents: docCount, collections: colCount, links: linkCount, totalWords }, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) }] };
    }
  });

  return server;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const db = initDB();
  console.log('[KB] Database initialized');

  const MODE = process.env.MODE || 'http';

  if (MODE === 'stdio' || MODE === 'both') {
    const mcpServer = createMCPServer(db);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.log('[KB] MCP Server (stdio) ready');
  }

  if (MODE === 'http' || MODE === 'both') {
    const app = createApp(db);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[KB] HTTP Server running on http://0.0.0.0:${PORT}`);
      console.log(`[KB] API: http://0.0.0.0:${PORT}/api`);
    });
  }
}

main().catch(console.error);
