import type { ProjectRole } from '../../types'

const ROLE_META: Record<ProjectRole, { label: string; className: string }> = {
  admin: {
    label: 'Project Admin',
    className: 'bg-blue-100 text-blue-700',
  },
  editor: {
    label: 'Editor',
    className: 'bg-emerald-100 text-emerald-700',
  },
  viewer: {
    label: '閲覧専用',
    className: 'bg-gray-100 text-gray-600',
  },
}

interface Props {
  role?: ProjectRole
}

export function ProjectRoleBadge({ role }: Props) {
  if (!role) return null

  const meta = ROLE_META[role]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  )
}
