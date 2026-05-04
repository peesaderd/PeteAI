import { Router, Request, Response } from 'express';

// ============================================================
// Design Tokens & Types
// ============================================================

export interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  typography: {
    fontFamily: string;
    headingFont: string;
    fontSizeXs: string;
    fontSizeSm: string;
    fontSizeBase: string;
    fontSizeLg: string;
    fontSizeXl: string;
    fontSize2xl: string;
    fontSize3xl: string;
    fontWeightLight: number;
    fontWeightNormal: number;
    fontWeightMedium: number;
    fontWeightBold: number;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

export interface ComponentSchema {
  name: string;
  props: Record<string, unknown>;
  slots: string[];
  events: string[];
  defaultClasses: string;
}

export interface LayoutDefinition {
  name: string;
  regions: string[];
  defaultRegion: string;
  responsive: boolean;
  breakpoints: string[];
}

export interface TenantBranding {
  tenantId: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  secondaryColor?: string;
  customCss?: string;
}

// ============================================================
// Default Design Tokens
// ============================================================

const defaultTokens: DesignTokens = {
  colors: {
    primary: '#2563eb',
    secondary: '#7c3aed',
    accent: '#f59e0b',
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    error: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    info: '#3b82f6',
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    headingFont: 'Inter, system-ui, -apple-system, sans-serif',
    fontSizeXs: '0.75rem',
    fontSizeSm: '0.875rem',
    fontSizeBase: '1rem',
    fontSizeLg: '1.125rem',
    fontSizeXl: '1.25rem',
    fontSize2xl: '1.5rem',
    fontSize3xl: '1.875rem',
    fontWeightLight: 300,
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  borderRadius: {
    sm: '0.125rem',
    md: '0.375rem',
    lg: '0.5rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },
};

// ============================================================
// Default Component Schemas
// ============================================================

const defaultComponentSchemas: ComponentSchema[] = [
  {
    name: 'Button',
    props: { variant: { type: 'string', default: 'primary' }, size: { type: 'string', default: 'md' }, disabled: { type: 'boolean', default: false } },
    slots: ['default'],
    events: ['click', 'focus', 'blur'],
    defaultClasses: 'inline-flex items-center justify-center font-medium rounded-md transition-colors',
  },
  {
    name: 'Input',
    props: { type: { type: 'string', default: 'text' }, placeholder: { type: 'string', default: '' }, disabled: { type: 'boolean', default: false }, required: { type: 'boolean', default: false } },
    slots: ['prefix', 'suffix'],
    events: ['change', 'input', 'focus', 'blur'],
    defaultClasses: 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
  },
  {
    name: 'Card',
    props: { padding: { type: 'string', default: 'md' }, shadow: { type: 'string', default: 'md' }, bordered: { type: 'boolean', default: false } },
    slots: ['header', 'default', 'footer'],
    events: [],
    defaultClasses: 'bg-white rounded-lg border border-gray-200',
  },
  {
    name: 'Modal',
    props: { open: { type: 'boolean', default: false }, size: { type: 'string', default: 'md' }, closable: { type: 'boolean', default: true } },
    slots: ['header', 'default', 'footer'],
    events: ['close', 'open'],
    defaultClasses: 'fixed inset-0 z-50 flex items-center justify-center',
  },
  {
    name: 'Table',
    props: { striped: { type: 'boolean', default: false }, hoverable: { type: 'boolean', default: true }, stickyHeader: { type: 'boolean', default: false } },
    slots: ['header', 'body', 'footer'],
    events: ['rowClick', 'sort'],
    defaultClasses: 'min-w-full divide-y divide-gray-200',
  },
  {
    name: 'Badge',
    props: { variant: { type: 'string', default: 'default' }, size: { type: 'string', default: 'sm' }, dot: { type: 'boolean', default: false } },
    slots: ['default'],
    events: [],
    defaultClasses: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  },
  {
    name: 'Dropdown',
    props: { placement: { type: 'string', default: 'bottom' }, trigger: { type: 'string', default: 'click' } },
    slots: ['trigger', 'menu'],
    events: ['open', 'close', 'select'],
    defaultClasses: 'relative inline-block text-left',
  },
];

// ============================================================
// Default Layout Definitions
// ============================================================

const defaultLayouts: LayoutDefinition[] = [
  {
    name: 'sidebar',
    regions: ['sidebar', 'header', 'main', 'footer'],
    defaultRegion: 'main',
    responsive: true,
    breakpoints: ['sm', 'md', 'lg', 'xl'],
  },
  {
    name: 'topbar',
    regions: ['header', 'main', 'footer'],
    defaultRegion: 'main',
    responsive: true,
    breakpoints: ['sm', 'md', 'lg', 'xl'],
  },
  {
    name: 'blank',
    regions: ['main'],
    defaultRegion: 'main',
    responsive: false,
    breakpoints: [],
  },
];

// ============================================================
// Redis Cache Helper (optional)
// ============================================================

let redisClient: any = null;

async function getRedisClient(): Promise<any> {
  if (redisClient) return redisClient;
  try {
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: 1, lazyConnect: true });
    await redisClient.connect();
    console.log('[UI API] Redis connected');
  } catch {
    console.log('[UI API] Redis unavailable, using memory cache');
    redisClient = null;
  }
  return redisClient;
}

async function cacheGet(key: string): Promise<string | null> {
  try {
    const client = await getRedisClient();
    if (client) return await client.get(key);
  } catch { /* ignore */ }
  return null;
}

async function cacheSet(key: string, value: string, ttl = 300): Promise<void> {
  try {
    const client = await getRedisClient();
    if (client) await client.setex(key, ttl, value);
  } catch { /* ignore */ }
}

// ============================================================
// Router Factory
// ============================================================

export function createUIRouter(): Router {
  const router = Router();

  // GET /api/ui/theme - return design tokens
  router.get('/theme', async (_req: Request, res: Response) => {
    try {
      const cached = await cacheGet('ui:theme');
      if (cached) {
        res.json({ status: 'ok', data: JSON.parse(cached), source: 'cache' });
        return;
      }
      await cacheSet('ui:theme', JSON.stringify(defaultTokens));
      res.json({ status: 'ok', data: defaultTokens, source: 'default' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: String(err) });
    }
  });

  // GET /api/ui/components - list component schemas
  router.get('/components', async (_req: Request, res: Response) => {
    try {
      const cached = await cacheGet('ui:components');
      if (cached) {
        res.json({ status: 'ok', data: JSON.parse(cached), source: 'cache' });
        return;
      }
      await cacheSet('ui:components', JSON.stringify(defaultComponentSchemas));
      res.json({ status: 'ok', data: defaultComponentSchemas, source: 'default' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: String(err) });
    }
  });

  // GET /api/ui/layouts - list layout definitions
  router.get('/layouts', async (_req: Request, res: Response) => {
    try {
      const cached = await cacheGet('ui:layouts');
      if (cached) {
        res.json({ status: 'ok', data: JSON.parse(cached), source: 'cache' });
        return;
      }
      await cacheSet('ui:layouts', JSON.stringify(defaultLayouts));
      res.json({ status: 'ok', data: defaultLayouts, source: 'default' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: String(err) });
    }
  });

  // GET /api/ui/settings - return UI settings (tenant branding, etc.)
  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenant?.id || 'default';
      const cacheKey = 'ui:settings:' + tenantId;
      const cached = await cacheGet(cacheKey);
      if (cached) {
        res.json({ status: 'ok', data: JSON.parse(cached), source: 'cache' });
        return;
      }
      const settings = {
        tenantId,
        theme: defaultTokens,
        language: 'th',
        locale: 'th-TH',
        timezone: 'Asia/Bangkok',
        dateFormat: 'dd/MM/2568',
        currency: 'THB',
        sidebarCollapsed: false,
        denseMode: false,
        fontSize: 'medium',
      };
      await cacheSet(cacheKey, JSON.stringify(settings));
      res.json({ status: 'ok', data: settings, source: 'default' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: String(err) });
    }
  });

  // POST /api/ui/theme - update theme (in memory, for demo)
  router.post('/theme', (req: Request, res: Response) => {
    const updates = req.body;
    Object.assign(defaultTokens, updates);
    res.json({ status: 'ok', data: defaultTokens });
  });

  return router;
}
