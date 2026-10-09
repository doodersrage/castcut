import type { Metadata, Viewport } from 'next';
import RootDocument from '@/components/RootDocument';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import { ROOT_VIEWPORT, rootMetadata } from '@/lib/root-metadata';
import './globals.css';

export const metadata: Metadata = rootMetadata(PRODUCT_NAME, PRODUCT_TAGLINE);

export const viewport: Viewport = ROOT_VIEWPORT;

/** Prompt Studio: the shared document, without Castcut's Play features or Film kiosk. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument>{children}</RootDocument>;
}
