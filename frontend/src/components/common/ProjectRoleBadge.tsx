import { getProjectRoleMeta } from '../../utils/projectRoles'

interface Props {
  role?: string | null
}

export function ProjectRoleBadge({ role }: Props) {
  const meta = getProjectRoleMeta(role)
  if (!meta) return null

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.badgeLabel}
    </span>
  )
}
