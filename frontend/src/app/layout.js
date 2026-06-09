import './globals.css'
import { Inter } from 'next/font/google'
import AuthGuard from '@/components/AuthGuard'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata = {
  title: 'Real Estate Accounting',
  description: 'Real Estate Society Management & Accounting System',
  // Favicon is handled by src/app/icon.png + src/app/apple-icon.png (Next.js
  // file convention). Next emits a content-hashed URL so browser favicon
  // caches bust automatically whenever the logo changes.
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <AuthGuard />
        {children}
      </body>
    </html>
  )
}
