import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { encryptApiKeyForDB, decryptApiKeyFromDB } from './crypto.js';

// =========================================================================
// LLM Providers Settings API
// ==========================================================================

const LLM_PROVIDER_TYPES = ['openai', 'anthropic', 'deepseek', 'ollama', 'openrouter'] as const;

// Default models available for each provider type (like OpenHands settings)
const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['llama3', 'llama3.1', 'llama3.2', 'mistral', 'codellama', 'mixtral', 'qwen2', 'qwen2.5', 'phi3', 'gemma2'],
  openrouter: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'anthropic/claude-3.5-haiku', 'google/gemini-pro', 'google/gemini-flash', 'meta-llama/llama-3.1-70b', 'deepseek/deepseek-chat'],
};

const DEFAULT_PROVIDERS = [
  { name: 'OpenHands', type: 'openai', endpoint: '', models: ['gpt-4o', 'gpt-4o-mini'], selected_model: 'gpt-4o', is_default: 1 },
  { name: 'OpenAI', type: 'openai', endpoint: 'https://api.openai.com/v1', models: PROVIDER_MODELS.openai, selected_model: 'gpt-4o', is_default: 0 },
  { name: 'Anthropic', type: 'anthropic', endpoint: 'https://api.anthropic.com/v1', models: PROVIDER_MODELS.anthropic, selected_model: 'claude-3-5-sonnet-20241022', is_default: 0 },
  { name: 'DeepSeek', type: 'deepseek', endpoint: 'https://api.deepseek.com', models: PROVIDER_MODELS.deepseek, selected_model: 'deepseek-chat', is_default: 0 },
  { name: 'Ollama', type: 'ollama', endpoint: 'http://localhost:11434', models: PROVIDER_MODELS.ollama, selected_model: 'llama3', is_default: 0 },
  { name: 'OpenRouter', type: 'openrouter', endpoint: 'https://openrouter.ai/api/v1', models: PROVIDER_MODELS.openrouter, selected_model: 'openai/gpt-4o', is_default: 0 },
];

export function createLLMProvidersRouter(): Router {
  const router = Router();

  // GET /api/settings/llm-providers - list all providers for tenant
  router.get('/', (req: Request, res: Response) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || 't_001';
      const db = getDatabase();
      const rows = db.prepare(
        'SELECT id, tenant_id, name, type, endpoint, api_key_encrypted, models, selected_model, is_default, created_at, updated_at FROM llm_providers WHERE tenant_id = ? ORDER BY is_default DESC, created_at ASC'
      ).all(tenantId) as any[];
      // Decrypt api_key for each provider (masked)
      const providers = rows.map((row: any) => {
        let apiKeyMasked = '';
        if (row.api_key_encrypted) {
          try {
            const decrypted = decryptApiKeyFromDB(row.api_key_encrypted);
            apiKeyMasked = decrypted.slice(0, 4) + '...' + decrypted.slice(-4);
          } catch { apiKeyMasked = '****'; }
        }
        // Parse models JSON
        let models: string[] = [];
        try { models = JSON.parse(row.models || '[]'); } catch { models = []; }
        return {
          id: row.id,
          tenant_id: row.tenant_id,
          name: row.name,
          type: row.type,
          endpoint: row.endpoint,
          api_key: apiKeyMasked,
          models,
          selected_model: row.selected_model || '',
          is_default: row.is_default,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      });
      res.json({ status: 'ok', data: providers });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/settings/llm-providers/models/:type - get available models for a provider type
  router.get('/models/:type', (req: Request, res: Response) => {
    const ptype = req.params.type as string;
    const models = PROVIDER_MODELS[ptype] || [];
    res.json({ status: 'ok', data: models });
  });

  // POST /api/settings/llm-providers - create or update provider
  router.post('/', (req: Request, res: Response) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || 't_001';
      const { id, name, type, endpoint, api_key, models, selected_model, is_default } = req.body;
      if (!name || !type) {
        return res.status(400).json({ status: 'error', message: 'name and type are required' });
      }
      if (!LLM_PROVIDER_TYPES.includes(type)) {
        return res.status(400).json({ status: 'error', message: `Invalid type. Must be one of: ${LLM_PROVIDER_TYPES.join(', ')}` });
      }
      const db = getDatabase();
      const now = Date.now();

      // Determine models list: use provided models, or fall back to defaults for this type
      const modelsList = Array.isArray(models) && models.length > 0
        ? models
        : (PROVIDER_MODELS[type] || []);
      const modelsJson = JSON.stringify(modelsList);

      // Determine selected model
      const selModel = selected_model || (modelsList.length > 0 ? modelsList[0] : '');

      if (id) {
        // Update existing
        const existing = db.prepare('SELECT * FROM llm_providers WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
        if (!existing) return res.status(404).json({ status: 'error', message: 'Provider not found' });

        const apiKeyEncrypted = api_key
          ? encryptApiKeyForDB(api_key)
          : existing.api_key_encrypted;

        db.prepare(
          'UPDATE llm_providers SET name = ?, type = ?, endpoint = ?, api_key_encrypted = ?, models = ?, selected_model = ?, is_default = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
        ).run(name, type, endpoint || '', apiKeyEncrypted, modelsJson, selModel, is_default ?? 0, now, id, tenantId);
        res.json({ status: 'ok', data: { id, updated: true } });
      } else {
        // Create new
        const newId = 'llm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const apiKeyEncrypted = api_key ? encryptApiKeyForDB(api_key) : '';
        db.prepare(
          'INSERT INTO llm_providers (id, tenant_id, name, type, endpoint, api_key_encrypted, models, selected_model, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(newId, tenantId, name, type, endpoint || '', apiKeyEncrypted, modelsJson, selModel, is_default ?? 0, now, now);
        res.json({ status: 'ok', data: { id: newId, created: true } });
      }
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // DELETE /api/settings/llm-providers/:id
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || 't_001';
      const db = getDatabase();
      const existing = db.prepare('SELECT * FROM llm_providers WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
      if (!existing) return res.status(404).json({ status: 'error', message: 'Provider not found' });
      db.prepare('DELETE FROM llm_providers WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId);
      res.json({ status: 'ok', data: { id: req.params.id, deleted: true } });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}

// ==========================================================================
// Seed default LLM providers for a new tenant
// ==========================================================================

export function seedDefaultLLMProviders(tenantId: string) {
  const db = getDatabase();
  const existing = db.prepare('SELECT COUNT(*) as count FROM llm_providers WHERE tenant_id = ?').get(tenantId) as any;
  if (existing.count > 0) return; // Already seeded

  const now = Date.now();
  const insert = db.prepare(
    'INSERT INTO llm_providers (id, tenant_id, name, type, endpoint, api_key_encrypted, models, selected_model, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (const prov of DEFAULT_PROVIDERS) {
    const id = 'llm_' + now + '_' + Math.random().toString(36).slice(2, 8);
    insert.run(id, tenantId, prov.name, prov.type, prov.endpoint, '', JSON.stringify(prov.models), prov.selected_model, prov.is_default, now, now);
  }
}
