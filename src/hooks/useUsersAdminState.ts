'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppFeatureId } from '@/lib/auth/features';
import type { AuthGroup, AuthUserPublic } from '@/lib/auth/types';
import type { AuditLogEntry } from '@/lib/auth/audit-log';
import type { SharedPresetEntry } from '@/lib/storage/shared-preset-store';
import type { SharedProject } from '@/lib/storage/shared-projects-store';
import type { UserAnalyticsSnapshot } from '@/lib/user/analytics';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { confirmAction } from '@/components/ui/ConfirmDialog';

export type UserFormState = {
  username: string;
  password: string;
  role: 'admin' | 'user' | 'viewer';
  groupIds: string[];
  blockedFeatures: AppFeatureId[];
  enabled: boolean;
  quotaMaxPerMinute: string;
  exportEnabled: boolean;
  email: string;
  emailNotifyBatch: boolean;
  emailNotifySecurity: boolean;
};

export type GroupFormState = {
  name: string;
  description: string;
  blockedFeatures: AppFeatureId[];
  quotaMaxPerMinute: string;
};

const EMPTY_USER_FORM: UserFormState = {
  username: '',
  password: '',
  role: 'user',
  groupIds: [],
  blockedFeatures: [],
  enabled: true,
  quotaMaxPerMinute: '',
  exportEnabled: false,
  email: '',
  emailNotifyBatch: true,
  emailNotifySecurity: true,
};

const EMPTY_GROUP_FORM: GroupFormState = {
  name: '',
  description: '',
  blockedFeatures: [],
  quotaMaxPerMinute: '',
};

export function useUsersAdminState() {
  const [users, setUsers] = useState<AuthUserPublic[]>([]);
  const [groups, setGroups] = useState<AuthGroup[]>([]);
  const [analyticsSnapshots, setAnalyticsSnapshots] = useState<UserAnalyticsSnapshot[]>([]);
  const [analyticsHistory, setAnalyticsHistory] = useState<Record<string, UserAnalyticsSnapshot[]>>(
    {}
  );
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [sharedPresets, setSharedPresets] = useState<SharedPresetEntry[]>([]);
  const [sharedPresetDraft, setSharedPresetDraft] = useState({
    label: '',
    hints: '',
    category: '',
  });
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [sharedProjectDraft, setSharedProjectDraft] = useState({
    name: '',
    notes: '',
    groupIds: [] as string[],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [groupForm, setGroupForm] = useState<GroupFormState>(EMPTY_GROUP_FORM);

  const selectedUser = useMemo(
    () => users.find(user => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId) ?? null,
    [selectedGroupId, groups]
  );

  const selectedUserAnalytics = useMemo(
    () => analyticsSnapshots.find(snapshot => snapshot.userId === selectedUserId) ?? null,
    [analyticsSnapshots, selectedUserId]
  );

  const refresh = useCallback(async () => {
    const [
      usersResponse,
      groupsResponse,
      analyticsResponse,
      auditResponse,
      presetsResponse,
      projectsResponse,
    ] = await Promise.all([
      fetch('/api/auth/users'),
      fetch('/api/auth/groups'),
      fetch('/api/auth/analytics'),
      fetch('/api/auth/audit'),
      fetch('/api/shared-presets'),
      fetch('/api/shared-projects'),
    ]);
    const usersData = (await usersResponse.json()) as { users?: AuthUserPublic[]; error?: string };
    const groupsData = (await groupsResponse.json()) as { groups?: AuthGroup[]; error?: string };
    const analyticsData = (await analyticsResponse.json()) as {
      snapshots?: UserAnalyticsSnapshot[];
      history?: Record<string, UserAnalyticsSnapshot[]>;
      error?: string;
    };
    const auditData = (await auditResponse.json()) as { entries?: AuditLogEntry[] };
    const presetsData = (await presetsResponse.json()) as { presets?: SharedPresetEntry[] };
    const projectsData = (await projectsResponse.json()) as { projects?: SharedProject[] };
    if (!usersResponse.ok) {
      throw new Error(usersData.error ?? 'Failed to load users.');
    }
    if (!groupsResponse.ok) {
      throw new Error(groupsData.error ?? 'Failed to load groups.');
    }
    setUsers(usersData.users ?? []);
    setGroups(groupsData.groups ?? []);
    if (analyticsResponse.ok) {
      setAnalyticsSnapshots(analyticsData.snapshots ?? []);
      setAnalyticsHistory(analyticsData.history ?? {});
    } else {
      setAnalyticsSnapshots([]);
      setAnalyticsHistory({});
    }
    setAuditEntries(auditResponse.ok ? (auditData.entries ?? []) : []);
    setSharedPresets(presetsData.presets ?? []);
    setSharedProjects(projectsData.projects ?? []);
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refresh().catch(error => {
        setStatus(error instanceof Error ? error.message : 'Failed to load auth data.');
      });
    });
  }, [refresh]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!selectedUser) {
        setUserForm(EMPTY_USER_FORM);
        return;
      }
      setUserForm({
        username: selectedUser.username,
        password: '',
        role: selectedUser.role,
        groupIds: selectedUser.groupIds,
        blockedFeatures: selectedUser.blockedFeatures,
        enabled: selectedUser.enabled,
        quotaMaxPerMinute: selectedUser.quotaMaxPerMinute
          ? String(selectedUser.quotaMaxPerMinute)
          : '',
        exportEnabled: Boolean(selectedUser.exportEnabled),
        email: selectedUser.email ?? '',
        emailNotifyBatch: selectedUser.emailNotifyBatch !== false,
        emailNotifySecurity: selectedUser.emailNotifySecurity !== false,
      });
    });
  }, [selectedUser]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!selectedGroup) {
        setGroupForm(EMPTY_GROUP_FORM);
        return;
      }
      setGroupForm({
        name: selectedGroup.name,
        description: selectedGroup.description ?? '',
        blockedFeatures: selectedGroup.blockedFeatures,
        quotaMaxPerMinute: selectedGroup.quotaMaxPerMinute
          ? String(selectedGroup.quotaMaxPerMinute)
          : '',
      });
    });
  }, [selectedGroup]);

  async function inviteUser() {
    setStatus(null);
    const response = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedUser?.id,
        username: userForm.username,
        role: userForm.role,
        groupIds: userForm.groupIds,
        blockedFeatures: userForm.blockedFeatures,
        enabled: userForm.enabled,
        quotaMaxPerMinute: userForm.quotaMaxPerMinute
          ? Number(userForm.quotaMaxPerMinute)
          : undefined,
        exportEnabled: userForm.exportEnabled,
        email: userForm.email,
        emailNotifyBatch: userForm.emailNotifyBatch,
        emailNotifySecurity: userForm.emailNotifySecurity,
      }),
    });
    const data = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) {
      setStatus(data.error ?? 'Failed to send invite.');
      return;
    }
    setStatus(data.message ?? 'Invite sent.');
    await refresh();
  }

  async function saveUser() {
    setStatus(null);
    const response = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedUser?.id,
        ...userForm,
        quotaMaxPerMinute: userForm.quotaMaxPerMinute
          ? Number(userForm.quotaMaxPerMinute)
          : undefined,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? 'Failed to save user.');
      return;
    }
    setStatus('User saved.');
    setSelectedUserId(null);
    await refresh();
  }

  async function saveGroup() {
    setStatus(null);
    const response = await fetch('/api/auth/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedGroup?.id,
        ...groupForm,
        quotaMaxPerMinute: groupForm.quotaMaxPerMinute
          ? Number(groupForm.quotaMaxPerMinute)
          : undefined,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? 'Failed to save group.');
      return;
    }
    setStatus('Group saved.');
    setSelectedGroupId(null);
    await refresh();
  }

  async function deleteUser(id: string) {
    const name = users.find(user => user.id === id)?.username;
    if (
      !(await confirmAction({
        title: name ? `Delete the user “${name}”?` : 'Delete this user?',
        confirmLabel: 'Delete user',
        tone: 'danger',
      }))
    ) {
      return;
    }
    const response = await fetch(`/api/auth/users?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? 'Failed to delete user.');
      return;
    }
    setStatus('User deleted.');
    setSelectedUserId(null);
    await refresh();
  }

  async function deleteGroup(id: string) {
    const name = groups.find(group => group.id === id)?.name;
    if (
      !(await confirmAction({
        title: name ? `Delete the group “${name}”?` : 'Delete this group?',
        confirmLabel: 'Delete group',
        tone: 'danger',
      }))
    ) {
      return;
    }
    const response = await fetch(`/api/auth/groups?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setStatus(data.error ?? 'Failed to delete group.');
      return;
    }
    setStatus('Group deleted.');
    setSelectedGroupId(null);
    await refresh();
  }

  // A failed request used to look like it worked: the draft cleared, the row stayed.
  async function sharedRequestFailed(
    request: Promise<Response>,
    fallback: string
  ): Promise<boolean> {
    try {
      const response = await request;
      if (response.ok) return false;
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(data.error ?? `${fallback} (${response.status}).`);
    } catch (error) {
      setStatus(`${fallback}: ${error instanceof Error ? error.message : 'network error'}.`);
    }
    return true;
  }

  async function publishPreset() {
    const failed = await sharedRequestFailed(
      fetch('/api/shared-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sharedPresetDraft),
      }),
      'Could not publish the preset'
    );
    if (failed) return;
    setSharedPresetDraft({ label: '', hints: '', category: '' });
    setStatus('Preset published.');
    await refresh();
  }

  async function deletePreset(id: string) {
    const label = sharedPresets.find(preset => preset.id === id)?.label?.trim();
    if (
      !(await confirmAction({
        title: label ? `Delete the shared preset “${label}”?` : 'Delete this shared preset?',
        body: 'It goes for everyone on this server.',
        confirmLabel: 'Delete preset',
        tone: 'danger',
      }))
    ) {
      return;
    }
    const failed = await sharedRequestFailed(
      fetch(`/api/shared-presets?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
      'Could not delete the preset'
    );
    if (failed) return;
    setStatus('Preset deleted.');
    await refresh();
  }

  async function publishProject() {
    const failed = await sharedRequestFailed(
      fetch('/api/shared-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sharedProjectDraft),
      }),
      'Could not publish the project'
    );
    if (failed) return;
    setSharedProjectDraft({ name: '', notes: '', groupIds: [] });
    setStatus('Project published.');
    await refresh();
  }

  async function deleteProject(id: string) {
    const name = sharedProjects.find(project => project.id === id)?.name?.trim();
    if (
      !(await confirmAction({
        title: name ? `Delete the shared project “${name}”?` : 'Delete this shared project?',
        body: 'It goes for everyone on this server.',
        confirmLabel: 'Delete project',
        tone: 'danger',
      }))
    ) {
      return;
    }
    const failed = await sharedRequestFailed(
      fetch('/api/shared-projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
      'Could not delete the project'
    );
    if (failed) return;
    setStatus('Project deleted.');
    await refresh();
  }

  return {
    users,
    groups,
    analyticsSnapshots,
    analyticsHistory,
    auditEntries,
    sharedPresets,
    sharedPresetDraft,
    setSharedPresetDraft,
    sharedProjects,
    sharedProjectDraft,
    setSharedProjectDraft,
    status,
    selectedUserId,
    setSelectedUserId,
    selectedGroupId,
    setSelectedGroupId,
    selectedUser,
    selectedGroup,
    selectedUserAnalytics,
    userForm,
    setUserForm,
    groupForm,
    setGroupForm,
    inviteUser,
    saveUser,
    saveGroup,
    deleteUser,
    deleteGroup,
    publishPreset,
    deletePreset,
    publishProject,
    deleteProject,
  };
}

export function formatCapturedAt(timestamp: number): string {
  if (!timestamp) {
    return 'Never synced';
  }
  return new Date(timestamp).toLocaleString();
}
