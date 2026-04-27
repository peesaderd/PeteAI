const API_BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API Error');
  }
  return res.json();
}

export const api = {
  // Health
  health: () => request('/health'),

  // Auth
  register: (data: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  // MCP
  mcp: (tool: string, args: any) => request('/mcp', { method: 'POST', body: JSON.stringify({ tool, args }) }),

  // Knowledge Base
  kb: {
    collections: () => request('/collections'),
    createCollection: (data: any) => request('/collections', { method: 'POST', body: JSON.stringify(data) }),
    documents: (params?: string) => request(`/documents${params || ''}`),
    getDocument: (id: string) => request(`/documents/${id}`),
    createDocument: (data: any) => request('/documents', { method: 'POST', body: JSON.stringify(data) }),
    updateDocument: (id: string, data: any) => request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteDocument: (id: string) => request(`/documents/${id}`, { method: 'DELETE' }),
    search: (q: string) => request(`/search?q=${encodeURIComponent(q)}`),
    graph: () => request('/graph'),
    stats: () => request('/stats'),
  },
};
