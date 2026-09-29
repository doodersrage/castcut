'use client';

import type { ReactNode } from 'react';
import { memo, useCallback, useId, useState } from 'react';
import {
  ToolEngineChip,
  ToolEngineSheet,
  useToolEngineSidebar,
  useWideEngineLayout,
} from '@/components/ToolEngineToggle';
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
   * When set with a sidebar, the sidebar is the tool's Engine: a header chip opens it as a
   * docked column on wide screens (open/closed remembered per key) or a bottom sheet otherwise.
   * The key doubles as the tool id for the chip's queue-quality summary.
   */
  sidebarPersistKey?: string;
  /** @deprecated Popover open state is ephemeral; ignored. */
  sidebarDefaultOpen?: boolean;
  sidebarTitle?: string | false;
  sidebarDescription?: string;
  children: ReactNode;
};

type EngineColumn = {
  id: string;
  /** Docked and showing (the column's controls mount only on wide screens). */
  open: boolean;
  wide: boolean;
  onHide: () => void;
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
  engine,
  children,
}: Omit<ToolLayoutProps, 'accent' | 'sidebarPersistKey' | 'sidebarDefaultOpen'> & {
  engine?: EngineColumn;
}) {
  const docked = Boolean(sidebar && engine?.open);
  const hasColumn = Boolean(sidebar && (!engine || engine.open));
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

        {docked && engine ? (
          // Engine column: CSS keeps the grid slot from the first paint (no main-column jump);
          // the controls mount once the screen is known to be wide, never hidden on phones.
          <aside
            id={engine.id}
            aria-label={sidebarTitle === false ? 'Engine' : sidebarTitle}
            data-testid="tool-engine-column"
            className="hidden xl:sticky xl:top-24 xl:block"
          >
            <section className="tool-engine-column sidebar-scroll xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
              <div className="tool-engine-column-header">
                <div className="min-w-0">
                  <h2 className="type-heading">
                    {sidebarTitle === false ? 'Engine' : sidebarTitle}
                  </h2>
                  {sidebarTitle === false ? null : (
                    <p className="type-caption">{sidebarDescription}</p>
                  )}
                </div>
                <button type="button" className="tool-engine-column-hide" onClick={engine.onHide}>
                  Hide
                </button>
              </div>
              {engine.wide ? <div className="ui-sidebar-dense">{sidebar}</div> : null}
            </section>
          </aside>
        ) : sidebar && !engine ? (
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
  ...rest
}: ToolLayoutProps & { sidebar: ReactNode; sidebarPersistKey: string }) {
  void _defaultOpen;
  const panelId = useId();
  const wide = useWideEngineLayout();
  // Docked column: open by default, remembered per tool. The sheet is per visit.
  const { engineOpen, setEngineOpen } = useToolEngineSidebar(sidebarPersistKey, true);
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
        engine={{ id: panelId, open: engineOpen, wide, onHide: () => setEngineOpen(false) }}
        headerActions={
          <>
            <ToolEngineChip
              open={wide ? engineOpen : sheetOpen}
              controls={panelId}
              toolId={sidebarPersistKey}
              onClick={() => (wide ? setEngineOpen(open => !open) : setSheetOpen(true))}
            />
            {headerActions}
          </>
        }
      />
      {wide ? null : (
        <ToolEngineSheet
          open={sheetOpen}
          onClose={closeSheet}
          title={title}
          description={description}
          id={panelId}
        >
          {sidebar}
        </ToolEngineSheet>
      )}
    </>
  );
}

/** Tool page chrome with an optional Engine (header chip → docked column or bottom sheet). */
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
  const { accent: _accent, sidebarPersistKey: _key, sidebarDefaultOpen: _def, ...frame } = props;
  void _accent;
  void _key;
  void _def;
  return <ToolLayoutFrame {...frame} />;
});

export default ToolLayout;
