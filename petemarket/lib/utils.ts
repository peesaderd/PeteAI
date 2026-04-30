import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'THB'): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date, locale = 'th-TH'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

export function getAppIcon(category: string): string {
  const icons: Record<string, string> = {
    video: '🎬',
    social: '📱',
    productivity: '⚡',
    affiliate: '💰',
    chat: '💬',
    automation: '🤖',
    developer: '🔧',
  }
  return icons[category] || '📦'
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    video: 'วิดีโอ',
    social: 'โซเชียล',
    productivity: 'เพิ่มประสิทธิภาพ',
    affiliate: 'Affiliate',
    chat: 'แชท',
    automation: 'อัตโนมัติ',
    developer: 'สำหรับนักพัฒนา',
  }
  return labels[category] || category
}