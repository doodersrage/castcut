import type { Metadata, Viewport } from 'next';

/** Root metadata for an app built on the shared shell (Castcut, Prompt Studio). */
export function rootMetadata(name: string, tagline: string): Metadata {
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: tagline,
    applicationName: name,
    manifest: '/manifest.json',
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      apple: [{ url: '/apple-icon', type: 'image/png' }],
      shortcut: ['/icon.svg'],
    },
    openGraph: {
      title: name,
      description: tagline,
      siteName: name,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description: tagline,
    },
  };
}
// Add themeColor directly to viewport to avoid flicker on initial load
export const ROOT_VIEWPORT: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
    { media: '(prefers-color-scheme: light)', color: '#f3f4f8' },
  ],
};
