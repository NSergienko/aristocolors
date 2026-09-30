import type { ReactNode } from 'react';

export const metadata = {
  title: 'AristoColors',
  description: 'AristoColors web workspace',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
