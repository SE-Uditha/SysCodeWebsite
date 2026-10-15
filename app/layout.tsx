import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'SysCode Software Solutions | Website Development Sri Lanka',
    template: '%s | SysCode Software Solutions',
  },
  description:
    'SysCode Software Solutions offers professional website development in Sri Lanka. Business websites, e-commerce, custom software and more.',
  keywords: [
    'Web Development Sri Lanka',
    'Website Design Sri Lanka',
    'Affordable Website Development',
    'Software Development Sri Lanka',
    'Next.js Developers Sri Lanka',
    'Business Website Development',
    'Custom Software Sri Lanka',
    'SysCode Software Solutions',
  ],
  openGraph: {
    title: 'SysCode Software Solutions',
    description: 'Smart Digital Solutions for Growing Businesses.',
    type: 'website',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    siteName: 'SysCode Software Solutions',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SysCode Software Solutions',
    description: 'Smart Digital Solutions for Growing Businesses.',
  },
  alternates: {
    canonical: '/',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <a href="#main-content" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
