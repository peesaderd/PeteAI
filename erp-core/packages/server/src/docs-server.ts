// ============================================================
// ERP Core - Documentation Server (Express Router + Fuse.js)
// ============================================================

import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Fuse from 'fuse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DocsModule {
  id: string;
  title: string;
  path: string;
  tags: string[];
}

interface DocsIndex {
  title: string;
  version: string;
  modules: DocsModule[];
}

let docsIndex: DocsIndex | null = null;
let fuse: Fuse<DocsModule> | null = null;
let docsDir: string;

async function loadIndex(): Promise<DocsIndex> {
  if (docsIndex) return docsIndex;
  const indexRaw = await fs.readFile(path.join(docsDir, 'index.json'), 'utf-8');
  docsIndex = JSON.parse(indexRaw) as DocsIndex;

  fuse = new Fuse(docsIndex.modules, {
    keys: ['title', 'tags'],
    threshold: 0.4,
    includeScore: true,
  });

  return docsIndex;
}

const router = Router();

// Initialize docs directory
router.use(async (_req: Request, _res: Response, next) => {
  if (!docsDir) {
    // __dirname is packages/server/dist when compiled
    docsDir = path.resolve(__dirname, '../docs');
  }
  next();
});

// GET /docs/ - return index
router.get('/', async (_req: Request, res: Response) => {
  try {
    const index = await loadIndex();
    res.json(index);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load documentation index', message: err.message });
  }
});

// GET /docs/modules/:id - return markdown content
router.get('/modules/:id', async (req: Request, res: Response) => {
  try {
    const index = await loadIndex();
    const module = index.modules.find((m) => m.id === req.params.id);
    if (!module) {
      return res.status(404).json({ error: `Module '${req.params.id}' not found` });
    }

    const filePath = path.join(docsDir, module.path);
    const content = await fs.readFile(filePath, 'utf-8');

    res.json({
      id: module.id,
      title: module.title,
      content,
      tags: module.tags,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load module', message: err.message });
  }
});

// GET /docs/search?q=keyword - search modules
router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const index = await loadIndex();
    if (!fuse) {
      return res.status(500).json({ error: 'Search index not initialized' });
    }

    const results = fuse.search(q);
    res.json({
      query: q,
      results: results.map((r) => ({
        id: r.item.id,
        title: r.item.title,
        tags: r.item.tags,
        score: r.score,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

export default router;
