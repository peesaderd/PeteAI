# API Reference

## REST API

### Health
```
GET /api/health
```

### Auth
```
POST /api/auth/register
  { "tenantId": "demo", "email": "...", "password": "..." }

POST /api/auth/login
  { "email": "...", "password": "..." }
```

### MCP Proxy
```
POST /api/mcp
  { "tool": "list_products", "args": { "tenantId": "demo", "limit": 50 } }
```

## MCP Tools

### Products
| Tool | Description |
|------|-------------|
| `list_products` | List products with filters |
| `get_product` | Get product detail |
| `create_product` | Create new product |
| `update_product` | Update product |
| `delete_product` | Delete product |

### Orders
| Tool | Description |
|------|-------------|
| `list_orders` | List orders |
| `get_order` | Get order detail |
| `create_order` | Create order |
| `update_order_status` | Update order status |

### CRM
| Tool | Description |
|------|-------------|
| `list_customers` | List customers |
| `get_customer` | Get customer detail |
| `create_customer` | Create customer |
| `update_customer` | Update customer |

### Inventory
| Tool | Description |
|------|-------------|
| `get_inventory` | Get inventory levels |
| `adjust_inventory` | Adjust stock |
| `list_low_stock` | Get low stock alerts |

### Finance
| Tool | Description |
|------|-------------|
| `list_invoices` | List invoices |
| `create_invoice` | Create invoice |
| `record_payment` | Record payment |

### Reports
| Tool | Description |
|------|-------------|
| `get_sales_report` | Sales analytics |
| `get_dashboard` | Dashboard data |

### Production
| Tool | Description |
|------|-------------|
| `list_production_orders` | List production orders |
| `create_production_order` | Create production order |
| `update_production_status` | Update status |

### Knowledge Base
| Tool | Description |
|------|-------------|
| `kb_list_collections` | List collections |
| `kb_create_collection` | Create collection |
| `kb_list_documents` | List documents |
| `kb_get_document` | Get document |
| `kb_create_document` | Create document |
| `kb_update_document` | Update document |
| `kb_delete_document` | Delete document |
| `kb_search` | Full-text search |
| `kb_get_graph` | Get document graph |
| `kb_get_stats` | Get KB statistics |

### Billing
| Tool | Description |
|------|-------------|
| `list_plans` | List subscription plans |
| `get_subscription` | Get tenant subscription |
| `create_subscription` | Create subscription |
| `cancel_subscription` | Cancel subscription |
| `check_limits` | Check usage limits |

### Etsy Connector
| Tool | Description |
|------|-------------|
| `etsy_get_auth_url` | Get OAuth URL |
| `etsy_exchange_code` | Exchange code for token |
| `etsy_refresh_token` | Refresh token |
| `etsy_sync_listings` | Sync products |
| `etsy_sync_receipts` | Sync orders |
| `etsy_sync_reviews` | Sync reviews |
| `etsy_get_shop` | Get shop info |
| `etsy_get_listing` | Get listing detail |
| `etsy_get_receipt` | Get receipt detail |
