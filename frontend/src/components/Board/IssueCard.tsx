import { Draggable } from '@hello-pangea/dnd'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Issue } from '../../types'
import { getLabels } from '../../api/labels'
import { useCurrentTime } from '../../hooks/useCurrentTime'
import { dueDateLabel } from '../../utils/date'
import { TypeIcon, PriorityBadge } from '../common/Badge'
import { Avatar } from '../common/Avatar'
import { Modal } from '../common/Modal'
import { IssueDetail } from '../Issue/IssueDetail'

interface Props {
  issue: Issue
  index: number
  projectId: string
}

export function IssueCard({ issue, index, projectId }: Props) {
  const [detailOpen, setDetailOpen] = useState(false)
  const qc = useQueryClient()
  const nowMs = useCurrentTime()

  const { data: projectLabels = [] } = useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels(projectId),
    staleTime: 60_000,
  })
  const allIssues = qc.getQueryData<Issue[]>(['issues', projectId]) ?? []
  const parent = issue.parent_id ? allIssues.find(i => i.id === issue.parent_id) : null
  const subtasks = issue.type === 'story' ? allIssues.filter(i => i.parent_id === issue.id) : []
  const doneTasks = subtasks.filter(i => i.status === 'done').length

  return (
    <>
      <Draggable draggableId={issue.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={provided.draggableProps.style}
            onClick={() => !snapshot.isDragging && setDetailOpen(true)}
            className={`bg-white rounded-lg border p-3 shadow-sm cursor-pointer select-none transition-shadow ${
              snapshot.isDragging
                ? 'border-blue-400 shadow-lg rotate-1 opacity-90'
                : 'border-gray-200 hover:shadow-md hover:border-blue-200'
            }`}
          >
            {/* エピックバッジ */}
            {issue.epic_id && issue.epic_title && (
              <div className="flex items-center gap-1 mb-1.5">
                <TypeIcon type="epic" />
                <span className="text-xs text-purple-600 truncate max-w-full font-medium">
                  {issue.epic_title}
                </span>
              </div>
            )}

            {/* 親ストーリーバッジ */}
            {parent && (
              <div className="flex items-center gap-1 mb-1.5">
                <TypeIcon type={parent.type} />
                <span className="text-xs text-gray-400 truncate max-w-full">
                  #{parent.number} {parent.title}
                </span>
              </div>
            )}

            <div className="flex items-start gap-2 mb-2">
              <TypeIcon type={issue.type} />
              <span className="text-xs text-gray-400 font-mono shrink-0">#{issue.number}</span>
              <span className="text-sm text-gray-900 font-medium leading-tight line-clamp-2">
                {issue.title}
              </span>
            </div>

            {/* サブタスク進捗（storyの場合） */}
            {issue.type === 'story' && subtasks.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-gray-400">{doneTasks}/{subtasks.length} 件</span>
                  <span className="text-xs text-gray-400">
                    {Math.round((doneTasks / subtasks.length) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1">
                  <div
                    className="bg-emerald-400 h-1 rounded-full transition-all"
                    style={{ width: `${(doneTasks / subtasks.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {issue.due_date && nowMs && (() => {
              const due = dueDateLabel(issue.due_date, nowMs)
              return (
                <div className={`text-xs mt-1 ${due.className}`}>
                  {due.text}
                </div>
              )
            })()}

            {issue.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {issue.labels.map(name => {
                  const color = projectLabels.find(l => l.name === name)?.color
                  return (
                    <span
                      key={name}
                      className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium"
                      style={{ backgroundColor: color ?? '#6b7280' }}
                    >
                      {name}
                    </span>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={issue.priority} />
                {issue.points != null && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                    {issue.points}pt
                  </span>
                )}
              </div>
              {issue.assignee_name && <Avatar name={issue.assignee_name} avatarUrl={issue.assignee_avatar_url ?? undefined} />}
            </div>
          </div>
        )}
      </Draggable>

      {detailOpen && (
        <Modal
          title={`${issue.type.toUpperCase()}-${issue.number}`}
          onClose={() => setDetailOpen(false)}
          size="lg"
        >
          <IssueDetail
            issueId={issue.id}
            projectId={projectId}
            onClose={() => setDetailOpen(false)}
          />
        </Modal>
      )}
    </>
  )
}
