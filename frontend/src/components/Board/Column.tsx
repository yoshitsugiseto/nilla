import { Droppable } from '@hello-pangea/dnd'
import type { Issue, IssueStatus } from '../../types'
import { IssueCard } from './IssueCard'

const statusMeta: Record<IssueStatus, { label: string; color: string }> = {
  todo: { label: 'Todo', color: 'border-gray-300' },
  in_progress: { label: 'In Progress', color: 'border-blue-400' },
  in_review: { label: 'In Review', color: 'border-purple-400' },
  done: { label: 'Done', color: 'border-emerald-400' },
}

interface Props {
  status: IssueStatus
  issues: Issue[]
  projectId: string
  canEdit: boolean
}

export function Column({ status, issues, projectId, canEdit }: Props) {
  const meta = statusMeta[status]

  return (
    <div className="flex flex-col min-w-64 flex-1">
      <div className={`flex items-center justify-between mb-3 pb-2 border-b-2 ${meta.color}`}>
        <span className="font-semibold text-gray-700 text-sm">{meta.label}</span>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {issues.length}
        </span>
      </div>

      <Droppable droppableId={status} isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex flex-col gap-2 flex-1 min-h-32 rounded-lg p-1 transition-colors duration-150 ${
              snapshot.isDraggingOver ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset' : ''
            }`}
          >
            {issues.length === 0 && (
              <div className={`flex-1 min-h-24 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${
                snapshot.isDraggingOver
                  ? 'border-blue-300 text-blue-300'
                  : 'border-gray-100 text-gray-200'
              }`}>
                <span className="text-xs select-none">ドロップ</span>
              </div>
            )}
            {issues.map((issue, index) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                index={index}
                projectId={projectId}
                canEdit={canEdit}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
