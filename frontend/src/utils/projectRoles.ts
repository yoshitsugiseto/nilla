import type { ProjectRole } from '../types'

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
