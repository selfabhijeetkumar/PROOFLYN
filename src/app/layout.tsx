import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'PROOFLYN — B2B Invoice Dispute Evidence Intelligence',
  description:
    'MCP-powered Evidence Intelligence Agent for B2B Invoice Dispute Investigation. Every Transaction Has a Story. Every Claim Has Proof.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
