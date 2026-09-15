import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import MobileStudioShell from '@/components/mobile/MobileStudioShell';

export const metadata: Metadata = {
  title: 'Mobile Studio',
  description:
    'Phone-first film loop: Capture → Look → Outfit → Day → Story. Stills and clips, Cut film, and Save to Cast on the phone. Desk handoff is optional.',
  manifest: '/manifest-mobile.json',
  appleWebApp: {
    capable: true,
    title: 'Mobile Studio',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
    { media: '(prefers-color-scheme: light)', color: '#f3f4f8' },
  ],
};

export default function MobileStudioLayout({ children }: { children: ReactNode }) {
  return <MobileStudioShell>{children}</MobileStudioShell>;
}
