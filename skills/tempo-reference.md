# tempo reference

Complete command list for tempo. Use this list. Do not guess.

## Invocation

```sh
tempo <command> [args]
bun run tempo -- <command> [args]
```

## Global flags

```sh
--db <path>   use this database
--human       print tables instead of JSON
--help        print help
```

Environment variable: `TEMPO_DB`.

## Output

Success: JSON on stdout.
Error: `{"error":{"code","message"}}` on stderr. Exit code 1.

## Statuses

`todo` `blocked` `in_progress` `in_review` `done` `cancelled`

`blocked` is derived. A todo task with an unfinished dependency shows
`blocked`. Do not claim a blocked task.

## Transitions

| from | to |
| --- | --- |
| `todo` | `in_progress`, `cancelled` |
| `blocked` | `cancelled` |
| `in_progress` | `in_review`, `cancelled` |
| `in_review` | `in_progress`, `done`, `cancelled` |
| `done` | terminal |
| `cancelled` | terminal |

## Projects

```sh
project create --name <name> [--description <text>]
project list
project show <projectId>
```

## Epics

```sh
epic create --project <projectId> --name <name> [--description <text>]
epic list --project <projectId>
epic show <epicId>
```

## Tasks

```sh
task create --epic <epicId> --name <name> [--description <text>] [--depends-on <id>[,<id>...]]
task create batch --epic <epicId> --file <file>
task list [--epic <epicId>] [--status <status>] [--agent <agentId>] [--unassigned]
task show <taskId>
task update <taskId> [--name <name>] [--description <text>]
task next --epic <epicId> [--agent <agentId>]
task take --epic <epicId> [--agent <agentId>]
task claim <taskId> --agent <agentId>
task release <taskId>
task submit <taskId> [--reviewer <agentId>]
task approve <taskId> [--as <reviewerId>]
task reject <taskId> --reason <text> [--as <reviewerId>]
task complete <taskId>
task cancel <taskId> --reason <text>
task depend <taskId> --on <depTaskId>
task undepend <taskId> --on <depTaskId>
```

`task list` works without `--epic`. Use `--agent`, `--status`, or `--unassigned`.
A dependency connects tasks in one epic only.

## Audit

```sh
event list --epic <epicId> [--entity <entityId>] [--limit <n>]
```

## Error codes

| code | meaning |
| --- | --- |
| `MISSING_ARGUMENT` | a flag or a value is missing |
| `INVALID_ARGUMENT` | a value is invalid |
| `INVALID_TRANSITION` | the transition is not allowed |
| `PROJECT_NOT_FOUND` | project id unknown |
| `PROJECT_NAME_TAKEN` | project name in use |
| `EPIC_NOT_FOUND` | epic id unknown |
| `TASK_NOT_FOUND` | task id unknown |
| `TASK_ALREADY_CLAIMED` | another agent claimed the task |
| `TASK_BLOCKED` | a dependency is unfinished |
| `NOT_REVIEWER` | you are not the designated reviewer |
| `SELF_REVIEW` | reviewer = assignee |
| `CYCLIC_DEPENDENCY` | the dependency creates a cycle |
| `DEPENDENCY_NOT_SAME_EPIC` | the dependency is in another epic |
| `UNKNOWN_COMMAND` | the command does not exist |
| `INTERNAL_ERROR` | unexpected failure |

## Agent loop

```sh
task=$(tempo task take --epic "$epic" --agent agent-1)
# do the work. red -> green -> refactor. one vertical slice.
tempo task submit "$taskId" [--reviewer reviewer-1]
```