import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin', 'thai'] })

export const metadata: Metadata = {
  title: 'AI Marketplace - ร้านค้า AI Apps อันดับ 1',
  description: 'แพลตฟอร์ม AI Marketplace ที่รวม mini-apps อัจฉริยะ สำหรับธุรกิจยุคใหม่',
  keywords: ['AI', 'Marketplace', 'SaaS', 'Mini-apps', 'Automation'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}