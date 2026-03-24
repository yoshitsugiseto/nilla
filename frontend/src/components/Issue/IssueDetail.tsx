import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getIssue, updateIssue, getComments, createComment, getActivity, getIssueChildren } from '../../api/issues'
import { getAttachments, uploadAttachment, deleteAttachment } from '../../api/attachments'
import { TypeIcon, PriorityBadge } from '../common/Badge'
import { Avatar } from '../common/Avatar'
import { IssueForm } from './IssueForm'
import { Modal } from '../common/Modal'
import { useToast } from '../common/Toast'
import type { IssueStatus } from '../../types'
import { Pencil, MessageSquare, Clock, Plus, ListTodo, Paperclip, Trash2, Upload } from 'lucide-react'

const STATUS_OPTIONS: { value: IssueStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
]

interface Props {
  issueId: string
  projectId: string
  onClose?: () => void
}

export function IssueDetail({ issueId, projectId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [tab, setTab] = useState<'comments' | 'files' | 'activity'>('comments')
  const [editing, setEditing] = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [commentText, setCommentText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', issueId],
    queryFn: () => getIssue(issueId),
  })

  const { data: subtasks = [], isError: subtasksError } = useQuery({
    queryKey: ['children', issueId],
    queryFn: () => getIssueChildren(issueId),
  })

  const { data: comments = [], isError: commentsError } = useQuery({
    queryKey: ['comments', issueId],
    queryFn: () => getComments(issueId),
    enabled: tab === 'comments',
  })

  const { data: activity = [], isError: activityError } = useQuery({
    queryKey: ['activity', issueId],
    queryFn: () => getActivity(issueId),
    enabled: tab === 'activity',
  })

  const { data: attachments = [], isError: attachmentsError } = useQuery({
    queryKey: ['attachments', issueId],
    queryFn: () => getAttachments(issueId),
    enabled: tab === 'files',
    refetchOnWindowFocus: false,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(issueId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', issueId] })
    },
    onError: () => showToast('ファイルのアップロードに失敗しました', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', issueId] })
    },
    onError: () => showToast('ファイルの削除に失敗しました', 'error'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: IssueStatus) => updateIssue(issueId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issue', issueId] })
      qc.invalidateQueries({ queryKey: ['issues', projectId] })
    },
    onError: () => showToast('ステータスの更新に失敗しました', 'error'),
  })

  const commentMutation = useMutation({
    mutationFn: () => createComment(issueId, commentText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', issueId] })
      setCommentText('')
    },
    onError: () => showToast('コメントの投稿に失敗しました', 'error'),
  })

  if (isLoading) {
    return <div role="status" aria-label="読み込み中" className="p-8 text-center text-gray-400">Loading...</div>
  }

  if (!issue) {
    return <div className="p-8 text-center text-red-400">イシューの取得に失敗しました</div>
  }

  if (editing) {
    return (
      <IssueForm
        projectId={projectId}
        issue={issue}
        onClose={() => {
          setEditing(false)
          qc.invalidateQueries({ queryKey: ['issue', issueId] })
          qc.invalidateQueries({ queryKey: ['issues', projectId] })
        }}
      />
    )
  }

  return (
    <>
    {addingSubtask && (
      <Modal title="サブタスクを追加" onClose={() => setAddingSubtask(false)}>
        <IssueForm
          projectId={projectId}
          parentId={issueId}
          parentPriority={issue.priority}
          sprintId={issue.sprint_id ?? undefined}
          onClose={() => {
            setAddingSubtask(false)
            qc.invalidateQueries({ queryKey: ['children', issueId] })
          }}
        />
      </Modal>
    )}
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon type={issue.type} />
            <span className="text-xs text-gray-400 font-mono shrink-0">#{issue.number}</span>
            <h2 className="text-lg font-semibold text-gray-900 truncate">{issue.title}</h2>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
            aria-label="イシューを編集"
          >
            <Pencil size={12} aria-hidden="true" /> 編集
          </button>
        </div>

        {/* Description */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-500 mb-1">説明</p>
          {issue.description ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {issue.description}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">説明なし</p>
          )}
        </div>

        {/* Subtasks (storyの場合 or 子タスクがある場合) */}
        {(issue.type === 'story' || subtasks.length > 0) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                <ListTodo size={14} /> 子タスク ({subtasks.length})
              </p>
              <button
                onClick={() => setAddingSubtask(true)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50"
              >
                <Plus size={12} /> 追加
              </button>
            </div>
            {subtasksError ? (
              <p className="text-xs text-red-400">サブタスクの取得に失敗しました</p>
            ) : subtasks.length === 0 ? (
              <p className="text-xs text-gray-400 italic">サブタスクなし</p>
            ) : (
              <div className="space-y-1">
                {subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                    <TypeIcon type={sub.type} />
                    <span className="text-xs text-gray-400 font-mono">#{sub.number}</span>
                    <span className="flex-1 text-gray-800 truncate">{sub.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      sub.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                      sub.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{sub.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4 flex gap-4">
          <button
            onClick={() => setTab('comments')}
            className={`flex items-center gap-1.5 text-sm pb-2 border-b-2 transition-colors ${
              tab === 'comments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare size={14} /> コメント
          </button>
          <button
            onClick={() => setTab('files')}
            className={`flex items-center gap-1.5 text-sm pb-2 border-b-2 transition-colors ${
              tab === 'files' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Paperclip size={14} /> ファイル {attachments.length > 0 && `(${attachments.length})`}
          </button>
          <button
            onClick={() => setTab('activity')}
            className={`flex items-center gap-1.5 text-sm pb-2 border-b-2 transition-colors ${
              tab === 'activity' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Clock size={14} /> アクティビティ
          </button>
        </div>

        {tab === 'comments' && (
          <div className="space-y-3">
            {commentsError && (
              <p className="text-sm text-red-400">コメントの取得に失敗しました</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="flex gap-3">
                <Avatar name={c.author_name} avatarUrl={c.author_avatar_url ?? undefined} />
                <div className="flex-1 bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-700">{c.author_name}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            ))}

            <div className="pt-2 space-y-2">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="コメントを入力..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={() => commentMutation.mutate()}
                disabled={!commentText.trim() || commentMutation.isPending}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {commentMutation.isPending ? '保存中...' : 'コメント'}
              </button>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-3">
            {attachmentsError && (
              <p className="text-sm text-red-400">ファイルの取得に失敗しました</p>
            )}
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                <Paperclip size={14} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={a.url}
                    download={a.filename}
                    className="text-sm text-blue-600 hover:underline truncate block"
                  >
                    {a.filename}
                  </a>
                  <span className="text-xs text-gray-400">
                    {(a.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(a.id)}
                  disabled={deleteMutation.isPending}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="削除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadMutation.mutate(file)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
              >
                <Upload size={14} />
                {uploadMutation.isPending ? 'アップロード中...' : 'ファイルを追加'}
              </button>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-2">
            {activityError && (
              <p className="text-sm text-red-400">アクティビティの取得に失敗しました</p>
            )}
            {!activityError && activity.length === 0 && (
              <p className="text-sm text-gray-400">アクティビティなし</p>
            )}
            {activity.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                <span>
                  <strong>{a.field}</strong> changed from{' '}
                  <span className="font-mono text-xs bg-gray-100 px-1 rounded">{a.old_value ?? '—'}</span>
                  {' → '}
                  <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1 rounded">{a.new_value ?? '—'}</span>
                </span>
                <span className="text-xs text-gray-400 ml-auto shrink-0">
                  {new Date(a.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar metadata */}
      <div className="w-48 shrink-0 space-y-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 mb-1">ステータス</p>
          <select
            value={issue.status}
            onChange={e => statusMutation.mutate(e.target.value as IssueStatus)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">優先度</p>
          <PriorityBadge priority={issue.priority} />
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-1">タイプ</p>
          <span className="flex items-center gap-1">
            <TypeIcon type={issue.type} />
            <span className="capitalize text-gray-700">{issue.type}</span>
          </span>
        </div>

        {issue.points != null && (
          <div>
            <p className="text-xs text-gray-400 mb-1">ポイント</p>
            <span className="font-mono font-semibold text-gray-800">{issue.points}</span>
          </div>
        )}

        {issue.assignee_name && (
          <div>
            <p className="text-xs text-gray-400 mb-1">担当者</p>
            <div className="flex items-center gap-2">
              <Avatar name={issue.assignee_name} avatarUrl={issue.assignee_avatar_url ?? undefined} />
              <span className="text-gray-700">{issue.assignee_name}</span>
            </div>
          </div>
        )}

        {issue.labels.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Labels</p>
            <div className="flex flex-wrap gap-1">
              {issue.labels.map(l => (
                <span key={l} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{l}</span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100 space-y-1">
          <p className="text-xs text-gray-400">
            Created {new Date(issue.created_at).toLocaleDateString('ja-JP')}
          </p>
          <p className="text-xs text-gray-400">
            Updated {new Date(issue.updated_at).toLocaleDateString('ja-JP')}
          </p>
        </div>
      </div>
    </div>
    </>
  )
}
