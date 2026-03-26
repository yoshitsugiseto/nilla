import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getComments, createComment } from '../../api/issues'
import { Avatar } from '../common/Avatar'
import { useToast } from '../common/Toast'

interface Props {
  issueId: string
}

export function IssueComments({ issueId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const [commentText, setCommentText] = useState('')

  const { data: comments = [], isError: commentsError } = useQuery({
    queryKey: ['comments', issueId],
    queryFn: () => getComments(issueId),
  })

  const commentMutation = useMutation({
    mutationFn: () => createComment(issueId, commentText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', issueId] })
      setCommentText('')
    },
    onError: () => showToast('コメントの投稿に失敗しました', 'error'),
  })

  return (
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
  )
}
