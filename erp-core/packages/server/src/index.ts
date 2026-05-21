// ============================================================
// ERP Core - Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRouter } from './api/routes.js';
import { createMCPServer, handleToolCall } from './mcp/server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDatabase } from './db/database.js';
import { AuthManager } from './auth/auth.js';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const MODE = process.env.MODE || 'http'; // 'http' | 'stdio' | 'both'

async function main() {
  // Initialize database
  const db = getDatabase();
  const auth = new AuthManager();
  console.log('[ERP] Database initialized');

  if (MODE === 'stdio' || MODE === 'both') {
    const mcpServer = createMCPServer();
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.log('[ERP] MCP Server (stdio) ready');
  }

  if (MODE === 'http' || MODE === 'both') {
    const app = express();
    app.use(cors());

    // Proxy AI Orchestrator routes (chat, agents, tasks, etc.)
    // Note: pathFilter paths are relative to the mount point (/api)
    const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:54516';
    app.use(createProxyMiddleware({
      target: ORCHESTRATOR_URL,
      pathFilter: ['/api/chat', '/api/agents', '/api/tasks', '/api/mcp', '/api/siyuan', '/api/openhands', '/api/workflows', '/api/health'],
      changeOrigin: true,
    }));

    app.use(express.json());

    // Serve static web app (from packages/web/dist)
    // __dirname is packages/server/dist when running compiled JS
    const webDist = path.resolve(__dirname, '../../web/dist');
    app.use(express.static(webDist));

    app.use('/api', createRouter());

    // MCP over HTTP (for AI agents)
    app.post('/mcp', async (req, res) => {
      try {
        const { tool, args } = req.body;
        if (!tool || !args) return res.status(400).json({ error: 'tool and args required' });
        const result = await handleToolCall(tool, args, db, auth);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) return;
      res.sendFile(path.join(webDist, 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[ERP] HTTP Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

main().catch(console.error);
