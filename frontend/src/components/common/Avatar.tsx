const colors = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]

function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return colors[h % colors.length]
}

export function Avatar({ name, size = 'sm', avatarUrl }: { name: string; size?: 'sm' | 'md'; avatarUrl?: string }) {
  const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        className={`inline-flex rounded-full object-cover ${sizeClass}`}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-medium ${colorFor(name)} ${sizeClass}`}
      title={name}
    >
      {initials}
    </span>
  )
}
