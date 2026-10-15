import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Admin | SysCode', template: '%s | SysCode Admin' },
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh min-w-0 bg-white text-black">{children}</div>;
}
