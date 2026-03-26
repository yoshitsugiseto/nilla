export interface User {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  provider: string
}

export interface Workspace {
  id: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  name: string
  email: string | null
  avatar_url: string | null
  role: string
  joined_at: string
}

export interface Project {
  id: string
  name: string
  key: string
  description: string | null
  workspace_id: string | null
  created_at: string
  updated_at: string
}

export type SprintStatus = 'planning' | 'active' | 'completed'

export interface Sprint {
  id: string
  project_id: string
  name: string
  goal: string | null
  status: SprintStatus
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export type IssueStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low'
export type IssueType = 'story' | 'task' | 'bug' | 'spike' | 'epic'

export interface Issue {
  id: string
  project_id: string
  sprint_id: string | null
  parent_id: string | null
  epic_id: string | null
  epic_title: string | null
  number: number
  title: string
  description: string | null
  type: IssueType
  status: IssueStatus
  priority: IssuePriority
  points: number | null
  assignee_id: string | null
  assignee_name: string | null
  assignee_avatar_url: string | null
  labels: string[]
  position: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface Comment {
  id: string
  issue_id: string
  user_id: string | null
  author_name: string
  author_avatar_url: string | null
  body: string
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  issue_id: string
  field: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface BurndownPoint {
  date: string
  ideal: number
  actual: number
}

export type IssueLinkType = 'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicates'

export interface IssueLink {
  id: string
  source_issue_id: string
  target_issue_id: string
  link_type: IssueLinkType
  linked_issue_id: string
  linked_issue_number: number
  linked_issue_title: string
  linked_issue_status: IssueStatus
  linked_issue_type: IssueType
  created_at: string
}

export interface VelocityPoint {
  sprint_name: string
  completed_points: number
}

export interface Attachment {
  id: string
  issue_id: string
  uploaded_by: string
  filename: string
  content_type: string
  size: number
  url: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  issue_id: string | null
  type: string
  message: string
  read: boolean
  created_at: string
}

// Form types
export interface CreateProject {
  name: string
  key: string
  description?: string
  workspace_id: string
}

export interface CreateSprint {
  name: string
  goal?: string
  start_date?: string
  end_date?: string
}

export interface CreateIssue {
  title: string
  description?: string
  type?: IssueType
  priority?: IssuePriority
  points?: number
  assignee_id?: string
  labels?: string[]
  sprint_id?: string
  parent_id?: string
  epic_id?: string
  due_date?: string
}

export interface UpdateIssue {
  title?: string
  description?: string
  type?: IssueType
  status?: IssueStatus
  priority?: IssuePriority
  points?: number
  assignee_id?: string | null
  labels?: string[]
  sprint_id?: string | null
  parent_id?: string | null
  epic_id?: string | null
  due_date?: string | null
}

export interface ProjectLabel {
  id: string
  project_id: string
  name: string
  color: string
  created_at: string
}

export interface IssueTemplate {
  id: string
  project_id: string
  name: string
  description: string | null
  type: IssueType
  priority: IssuePriority
  labels: string[]
  points: number | null
  created_at: string
}

export interface BulkUpdatePayload {
  issue_ids: string[]
  status?: IssueStatus
  sprint_id?: string
  assignee_id?: string
}
