# Project Design Document

> This document tracks design decisions made during conversations.
> Updated automatically by the `design-tracker` skill.

## Overview

Claude Code Orchestra is a multi-agent collaboration framework. Claude Code is the orchestrator, with Codex CLI for planning/design/complex code, Opus subagents (1M context) for research/analysis/implementation, and Gemini CLI for multimodal file processing (PDF/video/audio/image).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code Lead (Opus 4.6 — 200K context)                      │
│  Role: Orchestration, user interaction, task management           │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ Agent Teams (Opus)    │  │ Subagents (Opus)      │             │
│  │ (parallel + comms)    │  │ (isolated + results)  │             │
│  │                       │  │                       │             │
│  │ Researcher ←→ Archit. │  │ Code implementation   │             │
│  │ Implementer A/B/C     │  │ Codex consultation    │             │
│  │ Security/Quality Rev. │  │ Gemini consultation   │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                   │
│  External CLIs:                                                   │
│  ├── Codex CLI (gpt-5.4) — planning, design, complex code        │
│  └── Gemini CLI — multimodal file processing (PDF/video/audio/    │
│       image) only                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Roles

| Agent | Role | Responsibilities |
|-------|------|------------------|
| Claude Code (Main) | Overall orchestration | User interaction, task management, simple code edits |
| general-purpose (Opus) | Research, analysis & implementation | Research, codebase analysis, code implementation, Codex delegation |
| gemini-explore (Opus) | Multimodal file processing | PDF, video, audio, image content extraction |
| Codex CLI | Planning & complex implementation | Architecture design, implementation planning, complex code, debugging |
| Gemini CLI | Multimodal processing | PDF/video/audio/image content extraction (called via gemini-explore) |

## Implementation Plan

### Patterns & Approaches

| Pattern | Purpose | Notes |
|---------|---------|-------|
| Agent Teams | Parallel work with inter-agent communication | /startproject, /team-implement, /team-review |
| Subagents | Isolated tasks returning results | External research, Codex consultation, implementation |
| Skill Pipeline | `/startproject` → `/team-implement` → `/team-review` | Separation of concerns across skills |

### Libraries & Roles

| Library | Role | Version | Notes |
|---------|------|---------|-------|
| Codex CLI | Planning, design, complex code | gpt-5.4 | Architecture, planning, debug, complex implementation |
| Gemini CLI | Multimodal file reading | gemini-3-pro | PDF/video/audio/image extraction ONLY |

### Key Decisions

| Decision | Rationale | Alternatives Considered | Date |
|----------|-----------|------------------------|------|
| Workflow compression should continue in Backlog/Board through type-specific quick create, while first-run guidance should live in Dashboard and empty states instead of a separate onboarding flow | Small teams benefit more from shaving repeated creation steps and clarifying the first three pages to visit than from adding a standalone tutorial system; lightweight guidance stays in context and respects role-based read-only users | Build a dedicated onboarding wizard, or leave creation paths and empty states unchanged | 2026-03-27 |
| Workflow compression for small-to-medium teams should favor one-click search filters, inline issue metadata edits, prioritized notifications, and active sprint risk surfacing | The biggest remaining usability wins are not new entities but fewer clicks during triage and earlier visibility into risky work; these four additions improve the daily loop without adding Jira-scale complexity | Add more configuration surface area first, or rely on users to open full forms and manually scan sprint state | 2026-03-27 |
| Automation MVP should stay as workspace-level preset rules wired into existing issue and sprint mutations instead of a free-form rule builder | Small teams need repeatable nudges more than a generic automation DSL; a small preset set keeps the settings UI understandable, lets notifications reuse the current issue update paths, and makes sprint-close carryover deterministic without background jobs | Build a Jira-like if/else builder, or postpone automation until a broader event system exists | 2026-03-27 |
| Reporting precision improvements should reuse per-issue activity logs only for recent completed work and active-sprint done issues, while keeping `created_at -> updated_at` as a fallback | Small teams benefit from more realistic cycle-time numbers, but a separate analytics backend is still unnecessary; fetching activity only for the narrow completed set keeps the implementation simple and the UI responsive enough for current scale | Add a dedicated reporting backend first, or keep all cycle-time widgets as pure `created_at -> updated_at` approximations | 2026-03-27 |
| Reporting drill-down should reuse Search as the single issue-list destination, extending search filters only with `sprint_id` and `due_state=overdue` | The fastest path from insight to action is to land on the existing bulk-edit/search surface rather than build separate report detail views; `sprint` scope and overdue state cover the high-signal metrics while keeping the backend query model small | Build dedicated drill-down pages for each dashboard card, or postpone drill-down until a richer analytics model exists | 2026-03-27 |
| Activity timeline clarity should come from typed/system events plus frontend grouping, not from a separate audit UI | Small teams need issue-local history they can scan quickly while staying inside the detail panel; adding `review_ready`, `overdue`, and `sprint_carryover` events to `activity_logs` and grouping same-timestamp edits makes bulk operations and automation visible without introducing a second reporting surface | Build a dedicated audit page, or keep timeline as raw field diffs only | 2026-03-27 |
| Shared search reuse should split into local personal presets plus project-backed shared presets, while notification quick actions stay limited to the two highest-signal triage actions and bulk edit feedback should surface skip reasons inline | Small teams need team-wide triage entry points without losing personal scratch filters; saving shared presets on the server keeps them consistent per project, narrow notification actions avoid turning the bell into a second issue editor, and inline skipped-item reasons make bulk editing trustworthy without adding a separate job history screen | Move all presets server-side, add a broader notification action menu, or keep bulk-edit feedback at counts only | 2026-03-27 |
| Settings information architecture should group controls first by workspace vs project scope, then by operational subsection within each scope, using a top-to-bottom reading order with a narrower left-aligned shell instead of side-by-side comparison or a centered wide canvas | As automation, role controls, labels, and templates accumulate, the most important clarity win is to make scope boundaries obvious before users read individual controls; keeping `General / Automation / Members` under workspace and `Permissions / Labels / Templates` under project reduces accidental mental mixing, stacking those scopes vertically matches the natural reading flow better than forcing visual comparison between unrelated setting groups, and a narrower left-aligned layout avoids large empty scans while still feeling like part of the app shell rather than a centered settings dialog | Keep a flatter mixed settings page, split every settings area into independent routes, keep workspace/project in parallel columns, or let the vertical layout still span the full wide shell | 2026-03-27 |
| The next post-MVP polish order should prioritize automation execution visibility, then CI/E2E hardening, then more selective history/bulk/reports refinement | The current product loop is functionally broad enough that the biggest remaining trust gap is whether automation fired as expected; once that is observable, the next risks are test fragility and information density rather than missing core workflows | Expand notification actions first, or deepen reporting before making automation outcomes observable | 2026-03-27 |
| Post-MVP trust hardening should reuse existing surfaces instead of adding new admin pages: workspace settings host recent automation executions, issue detail hosts filtered timeline views, bulk retry happens inline from result feedback, reporting precision stays activity-derived with fallback heuristics, and the notification bell gets only one extra quick action (`start work`) | These refinements improve confidence and recovery paths without creating a second operations console; keeping each enhancement attached to the surface where users already act preserves the product's lighter-weight alternative-to-Jira positioning | Add dedicated audit/ops pages, broaden the notification bell into a mini editor, or postpone visibility work until a later analytics layer exists | 2026-03-27 |
| Final polish on top of the trust pass should prefer small in-surface controls over new flows: automation logs can be locally filtered by rule/result, timeline views should expose summary counts, bulk feedback should aggregate skip reasons, and notification actions should guard against redundant mutations before calling the API | These tweaks reduce scanning cost and avoid noisy "no-op" mutations without expanding the product surface area; they make the existing settings/detail/notification surfaces feel more deliberate rather than adding separate management screens | Add server-side filtered log views first, add a dedicated bulk retry wizard, or keep all safeguards implicit in toast errors only | 2026-03-28 |
| Viewer access should allow issue detail reads while all issue mutations remain editor-only, WS tickets must be consumed atomically, and comment mentions must resolve only within the issue workspace | Keeps read-only project roles usable in the UI, closes a direct mutation authorization hole, preserves one-time WS auth semantics under concurrency, and prevents cross-workspace notification leakage from duplicate display names | Keep viewer blocked from issue detail, rely on non-atomic select-then-delete ticket consumption, or resolve mentions against the global users table | 2026-03-27 |
| Frontend shell should lazy-load page and modal boundaries | Keeps the initial application bundle smaller while preserving the existing page state model and modal UX, and lets heavy flows like charts, issue detail, and sprint history load on demand | Keep all pages and modal content in the initial bundle | 2026-03-26 |
| Frontend test expansion should prioritize page-level integration coverage over more primitive component tests | The main frontend risk is now stateful workflow regression in forms, backlog, sprint flows, search, auth callback, and realtime invalidation rather than missing coverage for simple presentational components | Continue adding only isolated UI primitive tests or jump straight to broad E2E coverage | 2026-03-26 |
| Access tokens are session-bound and validated against the `sessions` table on every protected request | Logout or refresh-token revocation now invalidates already-issued access tokens without waiting for JWT expiry, while keeping the 5-minute TTL | Keep user-only JWT claims and rely on short TTL alone | 2026-03-26 |
| Public/private auth boundaries are expressed in router composition rather than a path whitelist | Removes brittle string-matching in middleware and makes auth requirements explicit at route registration time | Keep a global `PUBLIC_PATHS` bypass list in middleware | 2026-03-26 |
| Frontend API client auth logic is built through an injectable factory | Keeps axios interceptor behavior testable without browser redirects or global axios mocking, and makes refresh-failure handling deterministic | Keep a hard-wired singleton client with implicit globals | 2026-03-26 |
| Notification-driven issue opening state lives in the shared app store | Lets the bell UI hand off both issue id and issue title across route/workspace changes so the lazily loaded detail modal renders the correct heading | Keep transient title state inside `NotificationBell` and reconstruct UI text later | 2026-03-26 |
| Realtime delivery is scoped server-side by workspace plus per-user notifications | Reduces cross-workspace fan-out while preserving a single WebSocket connection for personal notifications; client-side workspace filtering remains as defense in depth | Keep one global broadcast channel and filter only on the client | 2026-03-26 |
| Realtime channels are created on subscribe and removed once idle | Prevents long-lived `HashMap` growth from publish-only workspaces/users while preserving broadcast semantics for active subscribers | Create channels eagerly on publish and keep them forever | 2026-03-26 |
| WebSocket ticket auth treats missing, expired, and reused tickets uniformly as unauthorized | Keeps the WS auth contract simple and lets tests lock in single-use ticket semantics without depending on client-side behavior | Distinguish missing ticket as bad request | 2026-03-26 |
| Cross-entity references must stay within the same project | Prevents issues from pointing at foreign sprints/epics/parents and corrupting burndown or workflow state | Trust UI-only restrictions | 2026-03-26 |
| Project-level permissions are overrides on top of workspace membership | Keeps workspace membership as the source of truth while allowing project-specific `viewer` / `editor` / `admin` restrictions and grants; inherited defaults map `owner/admin -> admin`, `member -> editor`, `viewer -> viewer` | Create fully separate project-only membership independent of workspace membership | 2026-03-26 |
| Frontend project-role UX should default to read-only rather than optimistic mutation attempts | Hides or disables mutation controls for `viewer`, keeps issue/sprint workflows available to `editor`, and reserves project settings mutation for `admin`, reducing avoidable `403` paths while preserving backend enforcement as the final authority | Leave all controls visible and rely on API failures only | 2026-03-26 |
| Settings UX should explicitly separate workspace vs project controls and explain effective project-role inheritance in-place | Initial users were finding project permission changes and role meaning hard to discover; a single settings page can still work if headers, labels, and read-only guidance make the scope and inheritance rules explicit where the decision is made | Split workspace and project settings into separate routes, or keep the existing mixed page without clearer guidance | 2026-03-27 |
| Search mode should remain active when either a text query or saved filter set is applied | Saved search presets were allowed to contain filters without text, so the app state must treat filters as first-class search context rather than tying search mode only to query length; the same principle avoids impossible CTAs in viewer empty states | Restrict presets to text queries only, or keep search mode keyed solely off query text | 2026-03-27 |
| Issue update API distinguishes `null` from omitted fields for nullable relations | Required to support explicit clearing of assignee/sprint/parent/epic/due date without treating it as "leave unchanged" | Sentinel strings or separate clear-only endpoints | 2026-03-26 |
| Time-sensitive due/deadline labels read time from a shared hook instead of `Date.now()` during render | Makes labels deterministic for tests/SSR and allows the UI to refresh on minute boundaries without unrelated rerenders | Call `Date.now()` directly inside render helpers | 2026-03-26 |
| Product-facing improvements should now prioritize workflow compression over new primitive UI | The current baseline is stable enough that the best next gains come from faster triage, search reuse, bulk editing, and better sprint/issue visibility rather than more isolated widgets | Continue expanding surface area with unrelated standalone components | 2026-03-26 |
| The next product phase should ship in three MVP slices in this order: bulk editing, actionable reporting, then template-based automation | Bulk editing removes the most daily friction for every editor, lightweight reporting improves sprint decisions without BI complexity, and narrow automation templates add leverage after the core workflows are already fast and observable | Build broad Jira-style automation first, or keep optimizing only single-issue interactions | 2026-03-27 |
| Reporting MVP should stay lightweight by reusing existing velocity/burndown charts and deriving cycle-time snapshots from `created_at -> updated_at` for recently completed issues | This adds project and sprint-level decision support immediately without introducing new backend history models yet; the approximation is good enough for small-team operational visibility and can later be replaced by status-transition timestamps if needed | Add a new analytics backend first, or avoid cycle-time reporting until full transition history exists | 2026-03-27 |
| Gemini role expanded to codebase analysis + research + multimodal | Gemini CLI has native 1M context; Claude Code is 200K; delegate large-context tasks to Gemini | Keep Claude for codebase analysis (requires 1M Beta) | 2026-02-19 |
| All subagents default to Opus | 200K context makes quality of reasoning more important than context size; Opus provides better output | Sonnet (cheaper but 200K same as Opus, weaker reasoning) | 2026-02-19 |
| Agent Teams default model changed to Opus | Consistent with subagent model selection; better reasoning for parallel tasks | Sonnet (cheaper) | 2026-02-19 |
| Claude Code context corrected to 200K | 1M is Beta/pay-as-you-go only; most users have 200K; design must work for common case | Assume 1M (only works for Tier 4+ users) | 2026-02-19 |
| Subagent delegation threshold lowered to ~20 lines | 200K context requires more aggressive context management | 50 lines (was based on 1M assumption) | 2026-02-19 |
| Codex role unchanged (planning + complex code) | Codex excels at deep reasoning for both design and implementation | Keep Codex advisory-only | 2026-02-17 |
| Gemini narrowed to multimodal only; research moved to Opus subagents | Opus/Sonnet now support 1M context; Gemini's context advantage is obsolete for text tasks | Keep Gemini for research (redundant with Opus 1M) | 2026-03-14 |
| /startproject split into 3 skills | Separation of Plan/Implement/Review gives user control gates | Single monolithic skill | 2026-02-08 |
| Agent Teams for Research ↔ Design | Bidirectional communication enables iterative refinement | Sequential subagents (old approach) | 2026-02-08 |
| Agent Teams for parallel implementation | Module-based ownership avoids file conflicts | Single-agent sequential implementation | 2026-02-08 |

## TODO

- [ ] Test Agent Teams workflow end-to-end with a real project
- [ ] Update hooks for Agent Teams quality gates
- [ ] Evaluate optimal team size for /team-implement
- [x] Ship bulk edit MVP for filtered issue sets: multi-select result sets, confirmable field updates, partial-success feedback, and bulk activity entries
- [x] Ship reporting MVP focused on sprint actionability: risk summary, throughput/cycle-time snapshots, and project/sprint trend widgets
- [x] Ship automation MVP as preset workspace rules for notifications, overdue escalation, reassignment nudges, and sprint-close carryover
- [x] Add automation execution visibility: workspace-level execution log, recent rule runs, and issue-local automation traces
- [x] Harden CI/E2E coverage around notification/settings/reporting flows with more resilient selectors and complete mocks
- [x] Add timeline filters plus bulk retry affordances so dense issue history stays actionable after partial-success updates
- [x] Improve reporting precision beyond the current fallback approximation where status-transition evidence exists
- [x] Consider one or two additional notification quick actions only after logs and tests make automation behavior trustworthy

## Open Questions

- [ ] Optimal team size for /team-implement (2-3 vs 4-5 teammates)?
- [ ] Should /team-review be mandatory or optional?
- [ ] How to handle Compaction in long Agent Teams sessions?

## Changelog

| Date | Changes |
|------|---------|
| 2026-03-28 | Relaxed the `SprintPage` active-sprint summary layout by keeping the KPI cards as the primary top-row content and moving the burndown panel into a centered lower row, reducing horizontal crowding while preserving the chart as a prominent summary artifact |
| 2026-03-28 | Added a final lightweight polish pass on top of the completed backlog: Workspace automation logs now support local rule/result filtering and progressive expansion, IssueActivity shows filter-specific summary counts and clearer empty states, bulk update feedback aggregates skipped reasons before retrying, NotificationBell prevents redundant self-assign actions and disables quick actions while requests are in flight, and the updated unit/build verification passed while Playwright execution remained blocked by the sandbox's inability to bind `127.0.0.1:3000` |
| 2026-03-27 | Completed the first post-MVP trust/polish pass: workspace settings now show recent automation execution logs, issue timelines can be filtered by comments/changes/automation with added assignee-notification traces, bulk-update result panels can reselect skipped issues, cycle-time reporting prefers the latest active-to-done transition before falling back, NotificationBell adds a narrow `着手する` action, and E2E helpers/specs were expanded to cover settings/notification flows with more complete mocks |
| 2026-03-27 | Captured the next refinement backlog after the MVPs: prioritize automation execution logs first, then CI/E2E hardening, then timeline filtering and bulk retry affordances before deeper reporting or broader notification actions |
| 2026-03-27 | Refined the vertical Settings layout further by making the shell narrower and left-aligned instead of centered, keeping the page integrated with the main app column while reducing horizontal scan distance |
| 2026-03-27 | Narrowed and centered the Settings shell after moving to vertical scope sections so the page reads more like a focused configuration flow than a wide dashboard |
| 2026-03-27 | Adjusted the scoped Settings layout from side-by-side columns to vertical sections so users read Workspace first and Project second while still keeping each scope internally grouped by operational subsection |
| 2026-03-27 | Reorganized Settings around scope boundaries: Workspace now reads as `General / Automation / Members`, while Project groups the role summary with `Permissions / Labels / Templates` inside a single project section instead of scattering project assets into a separate lower grid |
| 2026-03-27 | Added the next daily-operations polish slice: Search now separates local personal presets from project-shared presets backed by new search preset APIs, NotificationBell exposes narrow quick actions for self-assignment and overdue priority bumps, and Backlog/Search bulk updates now show skipped issue reasons inline |
| 2026-03-27 | Improved issue activity clarity: automation now records `review_ready` and `overdue` events, sprint completion writes `sprint_carryover` entries, and the Issue detail timeline groups same-timestamp edits while resolving assignee/sprint/label values into readable names |
| 2026-03-27 | Tightened the next small-team polish loop: notification filters now cover `review_ready` and `overdue`, and Dashboard/Sprint cycle-time widgets prefer status-transition activity logs for recent completed work while falling back to `created_at -> updated_at` when history is unavailable |
| 2026-03-27 | Added reporting drill-down MVP: Search filters now understand sprint scope and overdue-only views, Dashboard delivery cards link into filtered issue lists, and Sprint active/risk summaries can jump directly to the matching issue set for triage |
| 2026-03-27 | Shipped the automation MVP: workspace settings now expose preset automation toggles, issue status/assignee/due-date changes emit `review_ready` and `overdue` notifications plus gated reassignment nudges, bulk issue edits respect the same rules, and sprint completion can automatically carry unfinished work into the next open sprint |
| 2026-03-27 | Shipped the reporting MVP: Dashboard now shows delivery snapshots plus a velocity trend widget, SprintPage exposes an active sprint summary with inline burndown, and cycle time is approximated from issue creation-to-last-update for recently completed work |
| 2026-03-27 | Shipped the first roadmap slice for bulk editing: Search now supports bulk selection and updates alongside Backlog, bulk due dates are supported, bulk responses report updated vs skipped counts, and bulk field changes write per-issue activity entries |
| 2026-03-27 | Added the remaining small-team UX improvements: Backlog and Board now expose type-specific quick-create paths, Backlog bulk mode can select all visible issues in one step, and Dashboard plus Board/Backlog empty states now explain the recommended first workflow in-place |
| 2026-03-27 | Recorded the next product-phase roadmap: prioritize bulk edit MVP first, then actionable sprint/reporting views, then narrow template-based automation for recurring workflow triggers |
| 2026-03-27 | Added workflow-compression UX improvements for small teams: one-click search quick filters, inline Issue Detail updates for priority/assignee/sprint, notification sorting that prioritizes unread direct items, and active sprint risk summaries for overdue/unassigned/review-stalled work |
| 2026-03-27 | Closed follow-up review findings by requiring editor permission for issue updates, allowing viewer reads for issue detail, consuming WS tickets atomically, scoping @mention notifications to the issue workspace, and switching IssueDetail epic selection to a filtered epic-only query |
| 2026-03-27 | Updated demo seed data to include explicit project-role overrides so viewer/admin behavior can be exercised immediately after reseeding without manual setup |
| 2026-03-27 | Fixed UX review findings by making search state work with filter-only presets, restoring a valid bulk "unassigned" action in backlog, and changing viewer empty-state copy so users are no longer told to perform actions they cannot take |
| 2026-03-27 | Clarified settings UX by separating workspace/project sections in the page header, unifying project-role labels, and adding explicit inheritance/read-only guidance so users can understand where to change project permissions and what each effective role allows |
| 2026-03-26 | Polished project-role UI gating across backlog, board, sprint, issue detail, comments/files, and label/template settings so viewers see read-only UX, editors keep workflow actions, and admins keep settings mutation controls |
| 2026-03-26 | Added project-level role controls with inherited workspace-to-project mapping, project member override APIs, settings UI for per-project role management, and backend/frontend tests covering viewer/editor/admin behavior |
| 2026-03-26 | Split Playwright coverage by flow (`app-shell`, `project`, `search`, `sprint`) with shared E2E helpers, and lazy-loaded frontend page/modal boundaries to reduce the initial bundle and isolate heavy chunks such as burndown and issue detail |
| 2026-03-26 | Added a dedicated functional improvement backlog covering notification triage, saved search presets, bulk edit expansion, sprint insights, activity timeline clarity, targeted realtime patching, project-level roles, and CI-backed E2E execution |
| 2026-03-26 | Fixed three follow-up review issues: notification-triggered issue detail titles now flow through shared app state, realtime channel maps drop idle workspace/user senders instead of growing forever, and due/deadline labels use a timer-backed current-time hook rather than reading `Date.now()` during render |
| 2026-03-26 | Added `useWebSocket` coverage for ticket fetch ordering, workspace-scoped invalidation, and unauthorized-close no-retry semantics; added Playwright coverage for search-result detail open and sprint completion report flows |
| 2026-03-26 | Added page-level frontend coverage for `BacklogPage`, `SprintPage`, `SearchPage`, and `AuthCallbackPage`; `SprintPage` and `SearchPage` labels are now explicitly associated with form controls for accessibility and test stability |
| 2026-03-26 | Added `IssueForm` integration coverage for create/edit payload normalization, type restriction flows, template application, and mutation success/error behavior; `IssueForm` labels are now explicitly associated with controls for accessibility and testability |
| 2026-03-26 | Added a dedicated frontend testing backlog and prioritized page-level integration coverage for IssueForm, BacklogPage, SprintPage, SearchPage, AuthCallbackPage, and realtime invalidation behavior |
| 2026-03-26 | Finished remaining hardening/cleanup backlog: access tokens are session-bound, auth now uses router-level public/private composition, issue query SQL is deduplicated, route-local models moved under `models/`, Docker runtime directories are prepared for non-root execution, and low-priority concurrency/unicode tests were added |
| 2026-03-26 | Locked in sprint completion contract with tests: valid `next_sprint_id` moves only incomplete issues, current sprint cannot target itself, and completed target sprints are rejected |
| 2026-03-26 | Locked in issue list ordering contract with tests: `position ASC` first, then `created_at DESC` as the tie-breaker; reorder results are verified through subsequent list responses |
| 2026-03-26 | Refactored frontend API client into an injectable factory and added automated coverage for auth header attachment, 401 refresh retry, refresh failure logout, and 403/500 propagation |
| 2026-03-26 | Scoped realtime delivery server-side by workspace and user channels; WebSocket connections now subscribe with optional `workspace_id` instead of receiving global fan-out |
| 2026-03-26 | Added WebSocket ticket auth coverage for valid/missing/expired/reused cases and aligned missing ticket handling with `401 Unauthorized` |
| 2026-03-26 | Enforced same-project validation for issue sprint/parent/epic references; update API now distinguishes `null` vs omitted for nullable fields |
| 2026-03-14 | Gemini narrowed to multimodal-only; research/analysis delegated to Opus subagents (1M context) |
| 2026-02-19 | Context-aware redesign: Claude=200K, Gemini=1M (codebase+research+multimodal), all subagents/teams→Opus |
| 2026-02-17 | Role clarification: Gemini → multimodal only, Codex → planning + complex code, Subagents → external research |
| 2026-02-08 | Major redesign for Opus 4.6: 1M context, Agent Teams, skill pipeline |
| | Initial |
