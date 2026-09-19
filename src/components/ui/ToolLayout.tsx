'use client';

import type { ReactNode } from 'react';
import { memo } from 'react';
import { ToolEnginePopover } from '@/components/ToolEngineToggle';
import {
  ToolPageHeader,
  ToolPageShell,
  ToolSection,
  type ToolPageWidth,
} from '@/components/ui/ToolPageShell';
import { TOOL_SIDEBAR_DESCRIPTION, TOOL_SIDEBAR_TITLE } from '@/lib/tool-page-chrome';
import { type ToolAccent } from '@/lib/tool-theme';

type ToolLayoutProps = {
  accent?: ToolAccent;
  width?: ToolPageWidth;
  badge: ReactNode;
  title: string;
  description?: ReactNode;
  headerActions?: ReactNode;
  sidebar?: ReactNode;
  /**
   * When set with a sidebar, show Engine as a fixed floating dock instead of a
   * persistent right column. The key is reserved for future per-tool prefs.
   */
  sidebarPersistKey?: string;
  /** @deprecated Popover open state is ephemeral; ignored. */
  sidebarDefaultOpen?: boolean;
  sidebarTitle?: string | false;
  sidebarDescription?: string;
  children: ReactNode;
};

function ToolLayoutFrame({
  width = 'default',
  badge,
  title,
  description,
  headerActions,
  sidebar,
  sidebarTitle = TOOL_SIDEBAR_TITLE,
  sidebarDescription = TOOL_SIDEBAR_DESCRIPTION,
  children,
}: Omit<ToolLayoutProps, 'accent' | 'sidebarPersistKey' | 'sidebarDefaultOpen'>) {
  return (
    <ToolPageShell width={width}>
      <ToolPageHeader
        badge={badge}
        title={title}
        description={description}
        actions={headerActions}
      />

      <div
        className={
          sidebar
            ? 'grid items-start gap-[var(--block-gap)] xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8'
            : 'ui-section-stack'
        }
      >
        <div className="ui-section-stack min-w-0">{children}</div>

        {sidebar ? (
          <aside className="xl:sticky xl:top-24">
            <ToolSection
              variant="secondary"
              title={sidebarTitle === false ? undefined : sidebarTitle}
              description={sidebarTitle === false ? undefined : sidebarDescription}
              className="sidebar-scroll xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto"
            >
              <div className="ui-sidebar-dense">{sidebar}</div>
            </ToolSection>
          </aside>
        ) : null}
      </div>
    </ToolPageShell>
  );
}

function EnginePopoverToolLayout({
  sidebar,
  headerActions,
  sidebarTitle = TOOL_SIDEBAR_TITLE,
  sidebarDescription = TOOL_SIDEBAR_DESCRIPTION,
  sidebarPersistKey: _persistKey,
  sidebarDefaultOpen: _defaultOpen,
  ...rest
}: ToolLayoutProps & { sidebar: ReactNode }) {
  void _persistKey;
  void _defaultOpen;
  const title = sidebarTitle === false ? 'Engine' : sidebarTitle;
  const description =
    sidebarTitle === false ? 'Model, detail, and workflow for this tool.' : sidebarDescription;
  return (
    <ToolLayoutFrame
      {...rest}
      sidebar={undefined}
      headerActions={
        <>
          <ToolEnginePopover title={title} description={description}>
            {sidebar}
          </ToolEnginePopover>
          {headerActions}
        </>
      }
    />
  );
}

/** Tool page chrome with optional floating Engine dock for Settings controls. */
export const ToolLayout = memo(function ToolLayout(props: ToolLayoutProps) {
  void props.accent;
  if (props.sidebarPersistKey && props.sidebar) {
    return <EnginePopoverToolLayout {...props} sidebar={props.sidebar} />;
  }
  const { accent: _accent, sidebarPersistKey: _key, sidebarDefaultOpen: _def, ...frame } = props;
  void _accent;
  void _key;
  void _def;
  return <ToolLayoutFrame {...frame} />;
});

export default ToolLayout;
