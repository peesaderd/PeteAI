// ============================================================
// ERP Core - Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import { createRouter } from './api/routes.js';
import { createMCPServer, handleToolCall } from './mcp/server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDatabase } from './db/database.js';
import { AuthManager } from './auth/auth.js';

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
    app.use(express.json());
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

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[ERP] HTTP Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

main().catch(console.error);
