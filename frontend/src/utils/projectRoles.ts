import type { ProjectRole } from '../types'

type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export const PROJECT_ROLE_META: Record<ProjectRole, {
  label: string
  badgeLabel: string
  className: string
  description: string
}> = {
  admin: {
    label: 'プロジェクト管理者',
    badgeLabel: '管理者',
    className: 'bg-blue-100 text-blue-700',
    description: '権限、ラベル、テンプレートを含むプロジェクト設定を管理できます。',
  },
  editor: {
    label: '編集可',
    badgeLabel: '編集可',
    className: 'bg-emerald-100 text-emerald-700',
    description: 'イシューやスプリントを編集できますが、管理系設定は変更できません。',
  },
  viewer: {
    label: '閲覧専用',
    badgeLabel: '閲覧専用',
    className: 'bg-gray-100 text-gray-600',
    description: 'プロジェクト内容を閲覧できますが、更新はできません。',
  },
}

const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
  viewer: '閲覧専用',
}

export function normalizeProjectRole(role?: string | null): ProjectRole | undefined {
  if (role === 'admin' || role === 'owner') return 'admin'
  if (role === 'editor' || role === 'member') return 'editor'
  if (role === 'viewer') return 'viewer'
  return undefined
}

export function resolveProjectRole(
  projectRole?: string | null,
  workspaceRole?: string | null,
): ProjectRole | undefined {
  return normalizeProjectRole(projectRole) ?? normalizeProjectRole(workspaceRole)
}

export function getProjectRoleMeta(role?: string | null) {
  const normalizedRole = normalizeProjectRole(role)
  return normalizedRole ? PROJECT_ROLE_META[normalizedRole] : undefined
}

export function getWorkspaceRoleLabel(role?: string | null) {
  if (!role) return '不明'
  return WORKSPACE_ROLE_LABELS[role as WorkspaceRole] ?? role
}

export function getProjectRoleGuidance(role?: string | null) {
  const meta = getProjectRoleMeta(role)
  if (!meta) return null
  return meta.description
}
