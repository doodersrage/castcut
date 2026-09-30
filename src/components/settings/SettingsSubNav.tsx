'use client';

import type { ReactNode } from 'react';
import { SETTINGS_TABS, type SettingsTab, type SettingsTabDefinition } from '@/lib/settings-nav';
import { ToolMetaPanel } from '@/components/ui/ToolPageShell';

export default function SettingsSubNav({
  activeTab,
  onTabChange,
  tabs = SETTINGS_TABS,
  footer,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  tabs?: SettingsTabDefinition[];
  footer?: ReactNode;
}) {
  const active = tabs.find(tab => tab.id === activeTab);

  return (
    <ToolMetaPanel className="md:sticky md:top-24 md:z-20">
      <nav aria-label="Settings sections">
        {/* Mobile: compact select instead of chip wrap */}
        <div className="space-y-3 md:hidden">
          <label className="block space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Section</span>
            <select
              value={activeTab}
              onChange={event => onTabChange(event.target.value as SettingsTab)}
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              {tabs.map(tab => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
          </label>
          {active ? <p className="type-caption">{active.description}</p> : null}
          {footer}
        </div>

        {/* md+: vertical side list */}
        <div className="hidden md:block">
          <p className="type-overline mb-3 text-[var(--text-muted)]">Sections</p>
          <ul className="space-y-1">
            {tabs.map(tab => {
              const isActive = tab.id === activeTab;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`ui-settings-tab ${isActive ? 'is-active' : ''}`.trim()}
                  >
                    <span className="type-heading block">{tab.label}</span>
                    <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
                      {tab.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {footer}
        </div>
      </nav>
    </ToolMetaPanel>
  );
}
