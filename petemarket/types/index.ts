export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  stripe_customer_id: string | null
  subscription_status: SubscriptionStatus | null
  subscription_tier: SubscriptionTier | null
  created_at: string
  updated_at: string
}

export interface App {
  id: string
  name: string
  slug: string
  description: string
  long_description?: string
  icon: string
  category: AppCategory
  screenshots?: string[]
  is_active: boolean
  config: AppConfig
  price: number
  is_featured: boolean
  created_at: string
  updated_at: string
}

export type AppCategory = 
  | 'video'
  | 'social'
  | 'productivity'
  | 'affiliate'
  | 'chat'
  | 'automation'
  | 'developer'

export interface AppConfig {
  requiresApiKeys?: string[]
  requiresSubscription?: SubscriptionTier[]
  features?: string[]
  integrations?: string[]
  maxUsagePerMonth?: number
}

export interface UserApp {
  id: string
  user_id: string
  app_id: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
  app?: App
}

export interface UsageLog {
  id: string
  user_id: string
  app_id: string
  action: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  metadata?: Record<string, unknown>
}

export interface Conversation {
  id: string
  user_id: string
  app_id: string
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface SubscriptionPlan {
  id: string
  name: string
  description: string
  price: number
  interval: 'month' | 'year'
  features: string[]
  stripePriceId: string
  tier: SubscriptionTier
}