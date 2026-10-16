import { redirect } from 'next/navigation';

/**
 * Castcut's home is Film. Generate and the other classic tools are Prompt Studio's: they live in
 * its own repository (docs/architecture-boundaries.md).
 */
export default function Home() {
  redirect('/play');
}
