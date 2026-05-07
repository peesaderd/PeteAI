-- AI Marketplace Database Schema
-- Run this in Supabase SQL Editor

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'active',
  subscription_tier TEXT DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Apps table (available apps in store)
CREATE TABLE IF NOT EXISTS public.apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  long_description TEXT,
  icon TEXT DEFAULT '📦',
  category TEXT NOT NULL,
  screenshots TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  price DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for apps
CREATE POLICY "Active apps are viewable by everyone" 
  ON public.apps FOR SELECT USING (is_active = true);

CREATE POLICY "Only admins can manage apps" 
  ON public.apps FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND subscription_tier = 'enterprise'
    )
  );

-- 3. User apps (installed apps)
CREATE TABLE IF NOT EXISTS public.user_apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  app_id UUID REFERENCES public.apps(id) ON DELETE CASCADE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);

-- Enable RLS
ALTER TABLE public.user_apps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_apps
CREATE POLICY "Users can view their own apps" 
  ON public.user_apps FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can install apps" 
  ON public.user_apps FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own apps" 
  ON public.user_apps FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can uninstall their own apps" 
  ON public.user_apps FOR DELETE USING (auth.uid() = user_id);

-- 4. Usage logs
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id TEXT,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usage_logs
CREATE POLICY "Users can view their own usage logs" 
  ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own usage logs" 
  ON public.usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Chat conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  app_id TEXT NOT NULL,
  dify_conversation_id TEXT,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations" 
  ON public.conversations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversations" 
  ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Chat messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their conversations" 
  ON public.messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations" 
  ON public.messages FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_apps_user_id ON public.user_apps(user_id);
CREATE INDEX IF NOT EXISTS idx_user_apps_app_id ON public.user_apps(app_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- Seed data: Sample apps
INSERT INTO public.apps (name, slug, description, icon, category, is_active, is_featured, config, price) VALUES
  ('AI Video TikTok', 'ai-video-tiktok', 'สร้างวิดีโอ TikTok ด้วย AI อัตโนมัติ', '🎬', 'video', true, true, '{"requiresApiKeys": ["openai"]}', 0),
  ('Chat + RAG', 'chat-rag', 'แชท AI พร้อม RAG และ Memory', '💬', 'chat', true, true, '{"requiresApiKeys": ["openai", "supabase"]}', 0),
  ('Appsheet Alternative', 'appsheet-alternative', 'สร้าง app ธุรกิจโดยไม่ต้องเขียน code', '📱', 'productivity', true, false, '{"requiresSubscription": ["starter"]}', 299),
  ('Shopback Alternative', 'shopback-alternative', 'Affiliate tracker และ cashback', '💰', 'affiliate', true, true, '{"requiresSubscription": ["pro"]}', 799),
  ('Trip Planner', 'trip-planner', 'วางแผนท่องเที่ยวอัตโนมัติ', '✈️', 'affiliate', true, false, '{"requiresSubscription": ["pro"]}', 799),
  ('Social Auto Post', 'social-auto-post', 'โพสต์อัตโนมัติข้าม social media', '📤', 'social', true, false, '{"requiresApiKeys": ["openai", "social"]}', 0),
  ('Ghost Chat AI', 'ghost-chat-ai', 'AI browser ตอบคำถามลูกค้าอัตโนมัติ', '👻', 'chat', true, false, '{"requiresSubscription": ["pro"]}', 799)
ON CONFLICT (slug) DO NOTHING;