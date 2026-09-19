# tempo — Agent Task Manager

A local-first task tracker for AI agents. Projects → epics → tasks with
finish-to-start dependencies, a strict state machine, and a full audit log.
Made for [Bun](https://bun.sh) with `bun:sqlite`, exposed as a JSON-first CLI
for agents and a read-only TUI for humans.

## Install

```sh
bun install
# linked binary (CLI default / read-write):
bun link
# or run without linking:
bun run tempo -- <args>
```

Data lives in one user-wide database (auto-created on first use) so you can
keep one `project` per repo:
`~/.local/share/tempo/tempo.db` on Linux,
`~/Library/Application Support/tempo/tempo.db` on macOS,
`%APPDATA%\tempo\tempo.db` on Windows. Point `TEMPO_DB` (or `--db <path>`) at
a file to use something else — e.g. an older per-repo `./tempo.db`.

## CLI (for agents)

Everything is `bun:sqlite`, single file, JSON in/JSON out. Errors are printed
to stderr as `{"error":{"code","message","hint"}}` with a non-zero exit code;
`hint` (when present) is the suggested next step. Pass `--human` for formatted
tables, `--db <path>` (or `TEMPO_DB`) to select a database file (default: the
user-wide database above).

Made to be driven by agents:

- **Strict flags.** An unknown flag is an `UNKNOWN_FLAG` error (with a
  "did you mean" hint) instead of being ignored.
- **Agent identity.** Set `TEMPO_AGENT=<agentId>` once and it becomes the
  default for `--agent` (`task take`, `task claim`) and `--as` (`task approve`,
  `task reject`), and the actor recorded in the audit log. Without it,
  `task take` records `human` and `task claim` requires `--agent`.
- **Short ids.** Any unambiguous prefix of 4+ characters (the TUI shows 8) works
  wherever an id does; an ambiguous one is an `AMBIGUOUS_ID` error listing the
  matches.
- **Scoped help.** `tempo task`, `tempo task --help` list one group;
  `tempo task claim --help` shows one command.

```sh
# projects
tempo project create --name Acme --description widgets
tempo project list
tempo project show <projectId>

# epics
tempo epic create --project <projectId> --name Mobile --description ios
tempo epic list --project <projectId>
tempo epic show <epicId>

# tasks
tempo epic show <epicId>                                    # get epicId (+ summary)
tempo task create --epic <epicId> --name "Write spec"
tempo task create --epic <epicId> --name "Ship build" --depends-on <taskId>
tempo task list [--epic <epicId>] [--status todo] [--agent agent-1] [--unassigned]
tempo task show <taskId>                                    # deps + history
tempo task update <taskId> [--name "New name"] [--description "text"]
tempo task next --epic <epicId>                             # best unblocked todo
tempo task take --epic <epicId> [--agent agent-1]           # claim+next, atomically
tempo task claim <taskId> --agent agent-1                   # → in_progress
tempo task complete <taskId>                                # finish an unclaimed todo
tempo task submit <taskId> [--reviewer reviewer-1]          # → in_review
tempo task approve <taskId> [--as reviewer-1]               # → done
tempo task reject <taskId> --reason "needs more tests" [--as reviewer-1]  # → in_progress
tempo task release <taskId>                                 # unassign
tempo task cancel <taskId> --reason "won't fix"
tempo task depend <taskId> --on <dependencyTaskId>
tempo task undepend <taskId> --on <dependencyTaskId>

# audit log
tempo event list --epic <epicId> [--entity <taskId>] [--limit 50]
```

### Behaviour

- Statuses: `todo | blocked | in_progress | in_review | done | cancelled`.
  `blocked` is derived — a `todo` task with unfinished dependencies renders as
  `blocked` and cannot be claimed.
- `claim` is atomic: two agents claiming the same task race-safe; the loser
  gets `TASK_ALREADY_CLAIMED`. `task take` is the atomic pairing of
  `next` + `claim`: it returns the next available task already claimed for you
  (or `null` if there is none).
- `task list` works with or without `--epic`; omit it to scope across all
  epics by `--agent <agentId>` / `--status <status>` / `--unassigned`
  (e.g. "what's assigned to me?").
- `task update` edits a task's `name`/`description` while it is non-terminal
  (`todo`, `blocked`, `in_progress`, `in_review`); an empty string
  `--description ""` clears it. Terminal tasks (`done`, `cancelled`) reject
  updates.
- `task complete` finishes an unclaimed, unstarted `todo` task without going
  through claim/submit/review.
- Dependencies are finish-to-start and must be in the same epic; adding one
  that would create a cycle fails with `CYCLIC_DEPENDENCY`.
- Every state change writes an `Event`. `task next` returns the oldest
  unassigned, unblocked `todo` task (dependencies satisfied), or `null`.
- Example agent loop:

```sh
task=$(tempo task take --epic "$epic" --agent agent-1)   # JSON on stdout: task or null
# ... work ...
tempo task submit "$taskId" [--reviewer reviewer-1]
```

### Review workflow

- `task submit <taskId> --reviewer <agentId>` keeps the assignee and names a
  designated reviewer. The reviewer must differ from the assignee
  (`SELF_REVIEW`); submitting without `--reviewer` keeps the legacy flow.
- `task approve <taskId>` and `task reject <taskId> --reason <text>` act on an
  `in_review` task. When a reviewer was designated, you must pass `--as
  <reviewerAgentId>` matching it; anyone else gets `NOT_REVIEWER`. Tasks
  submitted without a reviewer are approved/rejected with no `--as`.
- `task approve` marks the task `done` and unblocks dependents;
  `task reject` sends it back to `in_progress`.

### Batch create

`task create batch --epic <epicId> --file <file>` bulk-creates tasks from
either a bare JSON array or an object with a `tasks` key. Use `--file -` to
read from stdin. `dependsOn` entries are sibling `ref`s or existing task ids:

```json
{
  "tasks": [
    { "ref": "spec", "name": "Write spec" },
    { "name": "Ship build", "dependsOn": ["spec"] }
  ]
}
```

## TUI (read-only, for humans)

```sh
tempo tui [--db <path>]          # defaults to the same user-wide database as the CLI
bun run tui -- <dbPath>          # equivalent via the tui script
```

The TUI opens the database **read-only** and polls every 750ms, so it can sit
next to an agent's writes and always show the current state. It runs in the
terminal's alternate screen buffer, always fills the whole terminal (and
re-lays out on resize), and fails with a friendly error if the database file
does not exist yet (create one first with `tempo project create`).
Full-screen works on any size: narrow terminals pan the board columns and show
the activity feed only when there is room.

- **project → epic selector**: `↑↓` move, `enter`/`→` drill in, `←`/`esc` back,
  `pgup`/`pgdn` page through long lists
- **kanban board** (per epic): one bordered box per status column, each with a
  title bar (glyph, status, task count) directly above its cards. The focused
  column is highlighted; `←→`/`tab` changes it, `↑↓` moves between tasks,
  `pgup`/`pgdn` pages, `enter` opens the task. Columns scroll horizontally when
  the terminal is too narrow (the footer shows which column you are on), and a
  live activity feed appears on wide terminals (≥116 cols)
- **task detail**: dependencies with live status, dependents, scrollable event
  history (`↑↓` scroll, `esc` back)
- `q` quits anywhere.

## Agent skills

Skills guide an agent through tempo, step-by-step. Plain markdown, agent-agnostic.
Point your agent at `skills/`, or copy them into your agent's skill directory.

- `skills/tempo-setup.md` — install, database, project/epic/tasks setup
- `skills/tempo-workflow.md` — the work loop, test-driven red-green + vertical slices, error recovery
- `skills/tempo-reference.md` — all commands, statuses, transitions, error codes

## Development

```sh
bun test         # 158 tests: domain, slices, CLI end-to-end, TUI render smoke
bun run typecheck
bun run tempo -- project list --human --db ./tempo.db   # dev against a local scratch db
```