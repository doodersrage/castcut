import { redirect } from 'next/navigation';

/**
 * Castcut's home is Film. Generate and the other classic tools are Prompt Studio's: their pages
 * live in src/studio-app, which only the classic app routes (docs/architecture-boundaries.md).
 */
export default function Home() {
  redirect('/play');
}
