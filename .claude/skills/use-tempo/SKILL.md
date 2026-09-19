---
name: use-tempo
description: Plan work in tempo and give the tasks to subagents. Use only when the user asks to use tempo.
disable-model-invocation: true
---

# Use tempo

You are the orchestrator. You plan the work and give tasks to subagents. Do not implement tasks yourself.

## How tempo works

- One repo has one project. A project has epics. An epic has tasks.
- An epic is one goal. A task is one small vertical slice of that goal. A vertical slice uses all the layers that one feature needs. A test can prove it.
- Add a dependency only if a task cannot start before another task is `done`.
- A task with an unfinished dependency is `blocked`. It becomes `todo` when the dependency is `done`.
- A task changes status in this order: `todo`, `in_progress`, `in_review`, `done`. A rejected task goes back to `in_progress`.
- Tempo saves each change in an audit log.
- Run `tempo --help` for the commands. When a command fails, read the `hint` in the error.
- An id prefix of 4 or more characters is valid.

## Procedure

1. Ask the user: "Must a human or an agent review the tasks?" Wait for the answer.
2. Run `tempo project list`. Find the project that has the name of this repo. If there is none, run `tempo project create --name <repo>`.
3. Run `tempo epic list --project <projectId>`. Find the epic for the goal of the user. If no epic fits, or you are not sure, ask the user. To make an epic, run `tempo epic create --project <projectId> --name <name>`.
4. Run `tempo epic show <epicId>`. Read the tasks that exist. Do not create a task twice.
5. Create the missing tasks with one command: `tempo task create batch --epic <epicId> --file -`. Send JSON on stdin. Give each task a `ref`, a `name`, and a `description`. Use `dependsOn` with the `ref` of other tasks.
6. Run `tempo task list --epic <epicId> --status todo`. Each task in the list is ready.
7. Start one implementer subagent for each ready task. Start them at the same time.
8. In each prompt, give the epic id, a unique agent id (`impl-1`, `impl-2`), and the review mode. Tell the subagent to use the `tempo-implement` skill.
9. Review the tasks that are `in_review`.
10. Go to step 6. Stop when all tasks in `tempo epic show` are `done`. Then report to the user.

## Review

Human review:

- Tell each implementer to submit without a reviewer.
- Tell the user which tasks are `in_review`. The user approves or rejects them. Wait.

Agent review:

- Tell each implementer to submit with `--reviewer reviewer`.
- Start one reviewer subagent for each `in_review` task.
- In each prompt, give the task id, the agent id `reviewer`, and the report of the implementer. Tell the subagent to use the `tempo-review` skill.

A rejected task stays with its implementer. Start a new implementer subagent. Give it the same agent id and the task id.

## Rules

- Do not approve a task yourself.
- Do not change a task that a subagent works on.
