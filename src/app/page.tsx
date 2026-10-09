import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { normalizeWorkspaceMode, WORKSPACE_MODE_COOKIE } from '@/lib/workspace-mode';
import { APP_HAS_PLAY } from '@/lib/app-profile';

const PromptGenerator = dynamic(() => import('@/components/PromptGenerator'), {
  loading: () => <ToolPageSkeleton label="Loading generate" />,
});

export default async function Home() {
  // Film (the play loop) starts at Play — a fresh install has no cookie and is Film too. The
  // tools are one switch away: Film's "All tools" moves the workspace to Studio first.
  const cookieStore = await cookies();
  // Castcut's home is always Film (Generate is Prompt Studio's).
  if (
    APP_HAS_PLAY ||
    normalizeWorkspaceMode(cookieStore.get(WORKSPACE_MODE_COOKIE)?.value) === 'play'
  ) {
    redirect('/play');
  }
  return (
    <PageCanvas accent="brand">
      <PromptGenerator />
    </PageCanvas>
  );
}
