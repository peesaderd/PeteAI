// ============================================================
// Docs API — Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { createDocsRouter } from './docs.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = path.resolve(__dirname, '../../../../docs');

describe('Docs API', () => {
  describe('Router creation', () => {
    it('should create a router with routes', () => {
      const router = createDocsRouter();
      expect(router).toBeDefined();
      expect(router.stack).toBeDefined();
      const routes = router.stack.filter((r: any) => r.route);
      expect(routes.length).toBeGreaterThan(0);
    });

    it('should have GET routes registered', () => {
      const router = createDocsRouter();
      const routes = router.stack.filter((r: any) => r.route && r.route.methods?.get);
      expect(routes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Doc content', () => {
    it('should have test-qa-pipeline doc available', () => {
      const files = fs.readdirSync(DOCS_ROOT);
      expect(files).toContain('test-qa-pipeline.md');
    });

    it('should have all required docs', () => {
      const files = fs.readdirSync(DOCS_ROOT).filter((f: string) => f.endsWith('.md'));
      expect(files.length).toBeGreaterThanOrEqual(6);
      expect(files).toContain('api.md');
      expect(files).toContain('architecture.md');
      expect(files).toContain('developer-guide.md');
    });

    it('should have docs with valid markdown titles', () => {
      const files = fs.readdirSync(DOCS_ROOT).filter((f: string) => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(DOCS_ROOT, file), 'utf-8');
        expect(content).toMatch(/^#\s+.+/m);
      }
    });
  });
});
