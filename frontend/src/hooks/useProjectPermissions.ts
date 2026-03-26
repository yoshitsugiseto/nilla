import { useQuery } from '@tanstack/react-query'
import { getProjectMembers } from '../api/workspaces'
import { useAuthStore } from '../store/auth'
import type { ProjectRole } from '../types'
import { normalizeProjectRole } from '../utils/projectRoles'

function canEdit(role?: ProjectRole) {
  return role === 'admin' || role === 'editor'
}

export function useProjectPermissions(projectId?: string | null) {
  const user = useAuthStore((state) => state.user)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => getProjectMembers(projectId!),
    enabled: !!projectId && !!user,
    staleTime: 60_000,
  })

  const member = members.find((item) => item.user_id === user?.id)
  const role = normalizeProjectRole(member?.role)

  return {
    role,
    isLoading,
    canViewProject: !!member,
    canEditProject: canEdit(role),
    canAdminProject: role === 'admin',
  }
}
