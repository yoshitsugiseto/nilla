import { useQuery } from '@tanstack/react-query'
import { getVelocity } from '../../api/sprints'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'

interface Props {
  projectId: string
}

export function VelocityChart({ projectId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['velocity', projectId],
    queryFn: () => getVelocity(projectId),
  })

  if (isLoading) {
    return <div role="status" aria-label="読み込み中" className="flex items-center justify-center h-48 text-gray-400 text-sm">読み込み中...</div>
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        完了済みスプリントがありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="sprint_name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          formatter={(v: number) => [`${v}pt`, '完了ポイント']}
          labelFormatter={l => `${l}`}
        />
        <Bar dataKey="completed_points" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? '#3b82f6' : '#a5b4fc'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
