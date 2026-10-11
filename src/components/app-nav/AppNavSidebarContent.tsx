'use client';

import { AppNavSidebarGroups } from '@/components/app-nav/AppNavSidebarGroups';
import { AppNavSidebarFooter } from '@/components/app-nav/AppNavSidebarFooter';
import { useAppNavSidebar } from '@/components/app-nav/useAppNavSidebar';
import AppSlot from '@/components/AppSlot';

export function AppNavSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const vm = useAppNavSidebar();

  return (
    <div className="flex h-full flex-col gap-6">
      {vm.impersonating ? (
        <div className="ui-alert-warning mx-2">
          Viewing as <span className="font-medium">{vm.user?.username}</span>
          {vm.impersonatorUsername ? ` (admin: ${vm.impersonatorUsername})` : ''}.
          <button
            type="button"
            onClick={() => void vm.endImpersonation()}
            className="ui-text-link mt-2 block"
          >
            Exit impersonation
          </button>
        </div>
      ) : null}

      {vm.navReady && !vm.guestShell ? <AppSlot name="nav.top" onNavigate={onNavigate} /> : null}

      <AppNavSidebarGroups
        pathname={vm.pathname}
        search={vm.search}
        navReady={vm.navReady}
        guestShell={vm.guestShell}
        pinnedLinks={vm.pinnedLinks}
        visibleGroups={vm.visibleGroups}
        workspaceMode={vm.workspaceMode}
        openGroups={vm.openGroups}
        favorites={vm.favorites}
        handleToggleFavorite={vm.handleToggleFavorite}
        handleToggleGroup={vm.handleToggleGroup}
        onNavigate={onNavigate}
      />

      <AppNavSidebarFooter
        pathname={vm.pathname}
        authEnabled={vm.authEnabled}
        user={vm.user}
        logout={vm.logout}
        navReady={vm.navReady}
        settingsVisible={vm.settingsVisible}
        profileVisible={vm.profileVisible}
        guestShell={vm.guestShell}
        onNavigate={onNavigate}
      />
    </div>
  );
}
