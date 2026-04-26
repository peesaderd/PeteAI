# AI Marketplace Platform - Core System

## 🎯 Overview
SaaS Marketplace platform with AI-powered mini-apps. Built with Next.js 14 + Supabase + Stripe.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                    │
│  /app                                                      │
│  ├── (marketing)/     → Landing page, pricing, docs       │
│  ├── (auth)/          → Login, register, forgot password    │
│  ├── (dashboard)/     → User dashboard, settings           │
│  └── (store)/         → App store, downloads, payments     │
├─────────────────────────────────────────────────────────────┤
│                    BACKEND SERVICES                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Supabase   │  │   Stripe    │  │   OpenHands/Dify   │ │
│  │  - Auth     │  │  - Checkout │  │  - AI Processing   │ │
│  │  - Database │  │  - Webhooks │  │  - RAG/LLM        │ │
│  │  - Storage  │  │  - Customer │  │  - Agent Tasks    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## ✨ Features

### Core System
- [x] Authentication (Supabase Auth + Magic Link)
- [x] User Management & Profiles
- [x] Role-Based Access Control (Admin, Member, Guest)
- [x] Subscription & Payment (Stripe)
- [x] App Store UI with Categories
- [x] AI Customer Support Chat

### Mini-Apps Framework (Ready to Build)
- [ ] AI Video TikTok Generator
- [ ] Chat App + RAG + Memory
- [ ] Appsheet Alternative
- [ ] Shopback Alternative (Affiliate)
- [ ] Trip Planner (Affiliate)
- [ ] Social Auto Post
- [ ] Ghost Chat AI Browser

## 🚀 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| UI Components | shadcn/ui |
| Backend | Supabase (Auth, Database, Storage, Realtime) |
| Payments | Stripe (Checkout, Webhooks, Customer Portal) |
| AI | Dify (RAG, LLM, Agents) |
| Deployment | Vercel |

## 📦 Getting Started

```bash
# 1. Clone repository
git clone <your-repo>
cd ai-marketplace

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local

# 4. Setup Supabase
# - Create a new project at supabase.com
# - Run migrations in supabase/migrations/
# - Enable Auth providers

# 5. Setup Stripe
# - Create Stripe account
# - Add API keys
# - Setup webhooks

# 6. Run development server
npm run dev
```

## 🔑 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Stripe Price IDs
STRIPE_PRICE_ID_MONTHLY=
STRIPE_PRICE_ID_YEARLY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 📁 Project Structure

```
ai-marketplace/
├── app/
│   ├── (marketing)/          # Landing pages
│   │   ├── page.tsx          # Home
│   │   ├── pricing/page.tsx  # Pricing
│   │   └── docs/page.tsx     # Documentation
│   ├── (auth)/               # Authentication
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/          # User dashboard
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Overview
│   │   ├── apps/page.tsx     # My Apps
│   │   ├── billing/page.tsx  # Subscription
│   │   └── settings/page.tsx
│   └── (store)/              # App Store
│       ├── page.tsx          # Browse apps
│       └── [appId]/page.tsx  # App detail
├── components/
│   ├── ui/                   # shadcn/ui components
│   ├── auth/                 # Auth components
│   ├── store/                # Store components
│   └── ai/                   # AI chat components
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Browser client
│   │   ├── server.ts         # Server client
│   │   └── middleware.ts     # Auth middleware
│   ├── stripe/
│   │   ├── client.ts
│   │   └── webhooks.ts
│   └── dify/
│       └── client.ts
├── hooks/                    # React hooks
├── types/                    # TypeScript types
└── supabase/
    └── migrations/           # Database migrations
```

## 🗄️ Database Schema

### Tables

```sql
-- Users extended profile
profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT,
  subscription_tier TEXT,
  created_at TIMESTAMP
)

-- Apps available in store
apps (
  id UUID PRIMARY KEY,
  name TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  icon TEXT,
  category TEXT,
  is_active BOOLEAN,
  config JSONB,
  created_at TIMESTAMP
)

-- User's installed apps
user_apps (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles,
  app_id UUID REFERENCES apps,
  settings JSONB,
  created_at TIMESTAMP
)

-- Usage logs
usage_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  app_id UUID,
  action TEXT,
  metadata JSONB,
  created_at TIMESTAMP
)
```

## 🔒 Security

- Row Level Security (RLS) on all tables
- Middleware-based auth protection
- Stripe webhook signature verification
- Rate limiting on API routes

## 📝 License

MIT License - Build your dreams 🚀