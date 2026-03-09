import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Playfair_Display } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { Providers } from '@/components/layout/Providers'
import '@/styles/globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-var',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#111110',
  colorScheme: 'dark',
}

export const metadata: Metadata = {
  title: { default: 'Dating App', template: '%s · Dating App' },
  description: 'Real connections, close to home. East Africa\'s dating app.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Dating App',
    description: 'Real connections, close to home.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable} ${playfair.variable}`}
    >
      <body>
        <Providers>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: '#1a1917',
                color: '#f5f5f4',
                border: '1px solid oklch(100% 0 0 / 10%)',
                fontFamily: 'var(--font-geist-sans)',
                fontSize: '13px',
                borderRadius: '10px',
                boxShadow: '0 4px 16px oklch(0% 0 0 / 50%)',
              },
              success: {
                iconTheme: { primary: '#4ade80', secondary: '#111110' },
              },
              error: {
                iconTheme: { primary: '#f87171', secondary: '#111110' },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
