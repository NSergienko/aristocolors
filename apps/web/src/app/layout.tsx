import '@/styles/globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AristoColors Studio',
  description: 'AI-Powered Photo-Bashing Web Application & AristoColors Profile Engine',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: 'var(--surface-0)', color: 'var(--text-primary)', minHeight: '100vh' }}>{children}</body>
    </html>
  );
}
