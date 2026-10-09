import type { Metadata, Viewport } from 'next';
import RootDocument from '@/components/RootDocument';
import PlayKioskShell from '@/components/PlayKioskShell';
import PlayFeatures from '@/components/PlayFeatures';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import { ROOT_VIEWPORT, rootMetadata } from '@/lib/root-metadata';
import './globals.css';

export const metadata: Metadata = rootMetadata(PRODUCT_NAME, PRODUCT_TAGLINE);

export const viewport: Viewport = ROOT_VIEWPORT;

/** Castcut: the shared document plus Play's features and the Film kiosk. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RootDocument
      features={<PlayFeatures />}
      kiosk={{
        // Castcut's Film kiosk in the Play workspace. Its header is fixed at every width
        // — sticky docks offset by --header-offset, which the sidebar layout sets to 0
        // on desktop.
        workspace: 'play',
        header: <PlayKioskShell />,
        contentClassName:
          'pt-[calc(4.25rem+env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] [--header-offset:4.35rem]',
      }}
    >
      {children}
    </RootDocument>
  );
}
