import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import ThemeInit from '@/components/ThemeInit';
import BrowserStorageInit from '@/components/BrowserStorageInit';
import TabSyncInit from '@/components/TabSyncInit';
import AmbientBackground from '@/components/AmbientBackground';
import AppShell from '@/components/AppShell';
import { AuthProvider } from '@/hooks/useAuth';
import { WorkspaceModeProvider } from '@/hooks/useWorkspaceMode';
import ComfyGalleryBackgroundPoller from '@/components/ComfyGalleryBackgroundPoller';
import UserScopeInit from '@/components/UserScopeInit';
import AutoStorageSyncInit from '@/components/AutoStorageSyncInit';
import NsfwGeneratorPluginInit from '@/components/NsfwGeneratorPluginInit';
import PluginRuntimeInit from '@/components/PluginRuntimeInit';
import DeferredShellClient from '@/components/DeferredShellClient';
import { normalizeWorkspaceMode, WORKSPACE_MODE_COOKIE } from '@/lib/workspace-mode';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** Display face for tool titles and branded moments — soft optical sizing, not a default UI sans. */
const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: PRODUCT_TAGLINE,
  applicationName: PRODUCT_NAME,
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon', type: 'image/png' }],
    shortcut: ['/icon.svg'],
  },
  openGraph: {
    title: PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
    siteName: PRODUCT_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
  },
};

// Add themeColor directly to viewport to avoid flicker on initial load
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
    { media: '(prefers-color-scheme: light)', color: '#f3f4f8' },
  ],
};

// Inline script for initial hydration to prevent FOUC
const themeInitScript = `(function(){try{var theme=localStorage.getItem("comfy-app-theme-v1");if(theme){document.documentElement.dataset.theme=theme.replace(/^"|"$/g,"")==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme.replace(/^"|"$/g,"");document.documentElement.style.colorScheme=document.documentElement.dataset.theme;}var ambient=localStorage.getItem("comfy-ambient-intensity-v1");if(ambient){document.documentElement.dataset.ambient=ambient.replace(/^"|"$/g,"");}var density=localStorage.getItem("comfy-ui-density-v1");if(density){document.documentElement.dataset.density=density.replace(/^"|"$/g,"");}var calm=localStorage.getItem("comfy-calm-ui-v1");if(calm){var c=calm.replace(/^"|"$/g,"");document.documentElement.dataset.calm=(c==="1"||c==="true")?"true":"false";}var workspace=localStorage.getItem("comfy-workspace-mode-v1");if(workspace){var w=workspace.replace(/^"|"$/g,"");if(w==="simple"||w==="play"||w==="studio"||w==="full"){document.documentElement.dataset.workspace=w;document.cookie="comfy-workspace-mode-v1="+w+"; Path=/; Max-Age=31536000; SameSite=Lax";}}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialWorkspace = normalizeWorkspaceMode(cookieStore.get(WORKSPACE_MODE_COOKIE)?.value);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      data-workspace={initialWorkspace}
      suppressHydrationWarning
    >
      <head>
        {/* Inline script for initial hydration to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="relative min-h-full overflow-x-hidden text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <AmbientBackground />
        <ThemeInit />
        <BrowserStorageInit />
        <TabSyncInit />
        <AuthProvider>
          <WorkspaceModeProvider initialMode={initialWorkspace}>
            <AppShell>
              <ComfyGalleryBackgroundPoller />
              <UserScopeInit />
              <AutoStorageSyncInit />
              <NsfwGeneratorPluginInit />
              <PluginRuntimeInit />
              <DeferredShellClient />
              {children}
            </AppShell>
          </WorkspaceModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
