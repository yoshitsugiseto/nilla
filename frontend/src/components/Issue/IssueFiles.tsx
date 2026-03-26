import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAttachments, uploadAttachment, deleteAttachment } from '../../api/attachments'
import { Paperclip, Trash2, Upload } from 'lucide-react'
import { useToast } from '../common/useToast'

interface Props {
  issueId: string
}

export function IssueFiles({ issueId }: Props) {
  const qc = useQueryClient()
  const showToast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: attachments = [], isError: attachmentsError } = useQuery({
    queryKey: ['attachments', issueId],
    queryFn: () => getAttachments(issueId),
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

  return (
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
  )
}
