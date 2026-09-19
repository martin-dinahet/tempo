# tempo — quick usage

A local-first task tracker for AI agents: projects → epics → tasks with
dependencies, a state machine, and a full audit log. JSON in/JSON out for
agents, plus a read-only TUI for humans.

## Setup

```sh
bun install
# linked binary:
bun link
# or run without linking:
bun run tempo -- <args>
```

## Storage

One database file per machine, shared by all repos. Because the schema is
projects → epics → tasks, keep one `project` per repo and use a single
database; no per-repo setup needed.

- Default location (auto-created on first use):
  - Linux: `~/.local/share/tempo/tempo.db`
  - macOS: `~/Library/Application Support/tempo/tempo.db`
  - Windows: `%APPDATA%\tempo\tempo.db`
  - Override with `--db <path>` or the `TEMPO_DB` env var (both take a plain
    file path, e.g. `TEMPO_DB=./tempo.db` to keep an older per-repo file).
- Existing per-repo `tempo.db` files are not picked up automatically. To keep
  using one, point `TEMPO_DB` at it, or migrate its data once via `tempo task`
  / `tempo project` against the new database.

## CLI

Output is JSON; add `--human` for tables. Errors print as
`{"error":{"code","message"}}` with exit code 1.

```sh
# start a project
tempo project create --name Acme
tempo project list

# add an epic inside it
tempo epic create --project <projectId> --name Mobile
tempo epic show <epicId>

# add tasks (dependent tasks show as "blocked" until their deps are done)
tempo task create --epic <epicId> --name "Write spec"
tempo task create --epic <epicId> --name "Ship build" --depends-on <taskId>
tempo task create batch --epic <epicId> --file tasks.json   # or: --file - (stdin)
tempo task list [--epic <epicId>] [--status todo]           # --epic optional
tempo task update <taskId> [--name "New name"] [--description ""]

# agent workflow
tempo task next --epic <epicId>   # best unblocked, unassigned todo (or null)
tempo task take --epic <epicId>   # claim+next, atomically (or null)
tempo task claim <taskId> --agent agent-1
tempo task complete <taskId>      # finish an unclaimed todo, no review flow
tempo task submit <taskId> [--reviewer reviewer-1]   # reviewer keeps assignee
tempo task approve <taskId> [--as reviewer-1]        # done; unblocks dependents
tempo task reject <taskId> --reason "needs more tests" [--as reviewer-1]

# dependencies
tempo task depend <taskId> --on <dependencyTaskId>
tempo task undepend <taskId> --on <dependencyTaskId>

# audit log
tempo event list --epic <epicId>
```

Statuses: `todo | blocked | in_progress | in_review | done | cancelled`.
`claim` is atomic (a race returns `TASK_ALREADY_CLAIMED`); `take` is the
atomic `next`+`claim`. Dependencies must be in the same epic and cannot
create cycles. Submitting with `--reviewer` names a designated reviewer who
must differ from the assignee and must act with `--as` to approve/reject.

## TUI

Read-only live view; safe to leave open while an agent works. Runs in the
alternate screen buffer and always fills the terminal, re-laying out on resize.

```sh
tempo tui [--db <path>]   # defaults to the same user-wide database as the CLI
bun run tui -- <dbPath>   # equivalent via the tui script
```

- `↑↓` move · `enter` drill in · `←`/`esc` go back · `q` quit
- selector: `pgup`/`pgdn` page long project/epic lists
- board: full-width kanban cards; the status strip across the top always lists
  every column and count. `←→`/`tab` focus a column, `↑↓` pick a task,
  `pgup`/`pgdn` page, `enter` opens detail. Columns pan horizontally on narrow
  terminals; the live activity feed shows on wide ones (≥116 cols).
- task detail: scroll the event history with `↑↓`

## Dev

```sh
bun test
bun run lint
bun run format
bun run typecheck
```