// ============================================================
// Etsy Connector - Main Entry
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { EtsyOAuth, EtsyToken } from './oauth.js';
import { EtsySync } from './sync.js';

const TOOLS = [
  {
    name: 'etsy_get_auth_url',
    description: 'Get Etsy OAuth authorization URL',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      redirectUri: z.string(),
      scopes: z.array(z.string()).default(['transactions_r', 'listings_r', 'shops_r', 'receipts_r', 'payments_r', 'reviews_r']),
    })),
  },
  {
    name: 'etsy_exchange_code',
    description: 'Exchange authorization code for tokens',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string(),
      code: z.string(),
      codeVerifier: z.string(),
    })),
  },
  {
    name: 'etsy_refresh_token',
    description: 'Refresh Etsy access token',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      refreshToken: z.string(),
    })),
  },
  {
    name: 'etsy_sync_listings',
    description: 'Sync products from Etsy shop',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      accessToken: z.string(),
      shopId: z.number(),
    })),
  },
  {
    name: 'etsy_sync_receipts',
    description: 'Sync orders from Etsy shop',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      accessToken: z.string(),
      shopId: z.number(),
      minCreated: z.number().optional(),
    })),
  },
  {
    name: 'etsy_sync_reviews',
    description: 'Sync reviews from Etsy shop',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      accessToken: z.string(),
      shopId: z.number(),
    })),
  },
  {
    name: 'etsy_get_shop',
    description: 'Get Etsy shop info',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      accessToken: z.string(),
      shopId: z.number(),
    })),
  },
  {
    name: 'etsy_get_listing',
    description: 'Get Etsy listing detail',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      accessToken: z.string(),
      shopId: z.number(),
      listingId: z.number(),
    })),
  },
  {
    name: 'etsy_get_receipt',
    description: 'Get Etsy receipt detail',
    inputSchema: zodToJsonSchema(z.object({
      clientId: z.string(),
      accessToken: z.string(),
      shopId: z.number(),
      receiptId: z.number(),
    })),
  },
];

export function createEtsyConnectorServer() {
  const server = new Server(
    { name: 'etsy-connector', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = args as Record<string, any>;

    try {
      switch (name) {
        case 'etsy_get_auth_url': {
          const etsy = new EtsyOAuth({
            clientId: params.clientId,
            clientSecret: '',
            redirectUri: params.redirectUri,
            scopes: params.scopes,
          });
          const { verifier, challenge, state } = etsy.generatePKCE();
          const url = etsy.getAuthorizationUrl(verifier, challenge, state);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ url, codeVerifier: verifier, state }, null, 2),
            }],
          };
        }

        case 'etsy_exchange_code': {
          const etsy = new EtsyOAuth({
            clientId: params.clientId,
            clientSecret: params.clientSecret,
            redirectUri: params.redirectUri,
            scopes: [],
          });
          const token = await etsy.getTokenFromCode(params.code, params.codeVerifier);
          return { content: [{ type: 'text', text: JSON.stringify(token, null, 2) }] };
        }

        case 'etsy_refresh_token': {
          const etsy = new EtsyOAuth({
            clientId: params.clientId,
            clientSecret: params.clientSecret,
            redirectUri: '',
            scopes: [],
          });
          const token = await etsy.refreshToken(params.refreshToken);
          return { content: [{ type: 'text', text: JSON.stringify(token, null, 2) }] };
        }

        case 'etsy_sync_listings':
        case 'etsy_sync_receipts':
        case 'etsy_sync_reviews':
        case 'etsy_get_shop':
        case 'etsy_get_listing':
        case 'etsy_get_receipt': {
          const etsy = new EtsyOAuth({
            clientId: params.clientId,
            clientSecret: '',
            redirectUri: '',
            scopes: [],
          });
          const sync = new EtsySync(etsy);

          let result;
          switch (name) {
            case 'etsy_sync_listings':
              result = await sync.syncListings(params);
              break;
            case 'etsy_sync_receipts':
              result = await sync.syncReceipts(params, params.minCreated);
              break;
            case 'etsy_sync_reviews':
              result = await sync.syncReviews(params);
              break;
            case 'etsy_get_shop':
              result = await sync.getShop(params);
              break;
            case 'etsy_get_listing':
              result = await sync.getListing(params);
              break;
            case 'etsy_get_receipt':
              result = await sync.getReceipt(params);
              break;
          }

          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) }],
      };
    }
  });

  return server;
}

// Allow running as standalone MCP server
const isMain = process.argv[1]?.includes('etsy');
if (isMain) {
  const server = createEtsyConnectorServer();
  const transport = new StdioServerTransport();
  server.connect(transport);
  console.error('[Etsy Connector] MCP Server ready');
}
