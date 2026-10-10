'use client';

import type { ReactNode } from 'react';
import { memo, useCallback, useId, useState } from 'react';
import { ToolEngineChip, ToolEngineSheet } from '@/components/ToolEngineToggle';
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
   * When set with a sidebar, the sidebar is the tool's Engine: the header chip opens it in the
   * Engine sheet on every screen (the editor Outfit and Story used first). The key doubles as the
   * tool id for the chip's queue-quality summary.
   */
  sidebarPersistKey?: string;
  /** @deprecated Popover open state is ephemeral; ignored. */
  sidebarDefaultOpen?: boolean;
  sidebarTitle?: string | false;
  sidebarDescription?: string;
  /** @deprecated Every page's Engine opens as a sheet now; ignored. */
  engineSheetOnly?: boolean;
  children: ReactNode;
};

/** The page has an Engine (opened in the sheet from the header chip). */
type EngineColumn = { id: string };

function ToolLayoutFrame({
  width = 'default',
  badge,
  title,
  description,
  headerActions,
  sidebar,
  sidebarTitle = TOOL_SIDEBAR_TITLE,
  sidebarDescription = TOOL_SIDEBAR_DESCRIPTION,
  engine,
  children,
}: Omit<ToolLayoutProps, 'accent' | 'sidebarPersistKey' | 'sidebarDefaultOpen'> & {
  engine?: EngineColumn;
}) {
  // A page with an Engine opens it in the sheet; a plain sidebar stays beside the content.
  const hasColumn = Boolean(sidebar && !engine);
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
          hasColumn
            ? 'grid items-start gap-[var(--block-gap)] xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8'
            : 'ui-section-stack'
        }
      >
        <div className="ui-section-stack min-w-0">{children}</div>

        {sidebar && !engine ? (
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

function EngineToolLayout({
  sidebar,
  headerActions,
  sidebarTitle = TOOL_SIDEBAR_TITLE,
  sidebarDescription = TOOL_SIDEBAR_DESCRIPTION,
  sidebarPersistKey,
  sidebarDefaultOpen: _defaultOpen,
  engineSheetOnly: _sheetOnly,
  ...rest
}: ToolLayoutProps & { sidebar: ReactNode; sidebarPersistKey: string }) {
  void _defaultOpen;
  void _sheetOnly;
  const panelId = useId();
  // One Engine editor everywhere: the sheet from the header chip (per visit), the page keeps
  // its full width.
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const title = sidebarTitle === false ? 'Engine' : sidebarTitle;
  const description = sidebarTitle === false ? undefined : sidebarDescription;
  return (
    <>
      <ToolLayoutFrame
        {...rest}
        sidebar={sidebar}
        sidebarTitle={sidebarTitle}
        sidebarDescription={sidebarDescription}
        engine={{ id: panelId }}
        headerActions={
          <>
            <ToolEngineChip
              open={sheetOpen}
              controls={panelId}
              toolId={sidebarPersistKey}
              onClick={() => setSheetOpen(true)}
            />
            {headerActions}
          </>
        }
      />
      <ToolEngineSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={title}
        description={description}
        id={panelId}
      >
        {sidebar}
      </ToolEngineSheet>
    </>
  );
}

/** Tool page chrome with an optional Engine (header chip → the Engine sheet). */
export const ToolLayout = memo(function ToolLayout(props: ToolLayoutProps) {
  void props.accent;
  if (props.sidebarPersistKey && props.sidebar) {
    return (
      <EngineToolLayout
        {...props}
        sidebar={props.sidebar}
        sidebarPersistKey={props.sidebarPersistKey}
      />
    );
  }
  const {
    accent: _accent,
    sidebarPersistKey: _key,
    sidebarDefaultOpen: _def,
    engineSheetOnly: _sheetOnly,
    ...frame
  } = props;
  void _sheetOnly;
  void _accent;
  void _key;
  void _def;
  return <ToolLayoutFrame {...frame} />;
});

export default ToolLayout;
