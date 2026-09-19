# tempo workflow

This skill defines the correct work loop for tempo.
Do not guess. Run the command first. Read the output.

## Identity

Choose one agent id. Example: `agent-1`.
Use the same id for all commands.

## Work loop

1. Take the next task. The command is atomic.
   ```sh
   tempo task take --epic <epicId> --agent agent-1
   ```
   Output = one task or `null`. `null` means no work.
2. If the output is `null`:
   ```sh
   tempo task list --epic <epicId>
   ```
   Report the state.
3. Inspect the task.
   ```sh
   tempo task show <taskId>
   ```
   Output = name, status, agent, dependencies, history.
4. Do the work. Use the preferred method:
   a. Write a failing test first. Run it. The test fails. This is red.
   b. Write the code. Run the test. The test passes. This is green.
   c. Refactor. Keep the test green.
   d. Do one vertical slice at a time.
   e. Do not build a horizontal layer first.
5. Submit the work.
   ```sh
   tempo task submit <taskId>
   ```
   For a designated reviewer:
   ```sh
   tempo task submit <taskId> --reviewer <reviewerId>
   ```
6. Review, when you are the reviewer.
   Approve:
   ```sh
   tempo task approve <taskId> --as <reviewerId>
   ```
   Reject:
   ```sh
   tempo task reject <taskId> --reason <text> --as <reviewerId>
   ```
7. Repeat the loop.

## Other transitions

Claim a specific task:

```sh
tempo task claim <taskId> --agent agent-1
```

Finish an unclaimed todo task without review:

```sh
tempo task complete <taskId>
```

Return a task to the pool:

```sh
tempo task release <taskId>
```

Remove a task you will not do:

```sh
tempo task cancel <taskId> --reason <text>
```

Update the name or the description:

```sh
tempo task update <taskId> [--name <text>] [--description <text>]
```

Change dependencies:

```sh
tempo task depend <taskId> --on <depTaskId>
tempo task undepend <taskId> --on <depTaskId>
```

## Preferred method

Use test-driven development. Red-green cycle:

- red: write the test. The test fails.
- green: write the code. The test passes.
- refactor: improve the code. The test stays green.

Use vertical design:

- Deliver one vertical slice at a time.
- A vertical slice goes through the complete stack for one feature.
- Do not complete all tasks of one layer first.
- Example for one feature: test, data, api, view. Then move to the next feature.

Read the task name and the description. Do the described slice.

## Error recovery

Tempo prints errors as JSON to stderr:

```json
{"error":{"code","message"}}
```

| code | action |
| --- | --- |
| `TASK_ALREADY_CLAIMED` | another agent took the task. Take another one. |
| `TASK_BLOCKED` | a dependency is unfinished. Do the dependency first. |
| `INVALID_TRANSITION` | the action is not allowed. Run `tempo task show`. |
| `NOT_REVIEWER` | a reviewer is designated. Use `--as <reviewerId>`. |
| `SELF_REVIEW` | reviewer = assignee. Use a different reviewer. |
| `TASK_NOT_FOUND` | wrong id. Run `tempo task list`. |
| `EPIC_NOT_FOUND` | wrong id. Run `tempo epic list --project <projectId>`. |
| `CYCLIC_DEPENDENCY` | the dependency creates a cycle. Remove the dependency. |
| `DEPENDENCY_NOT_SAME_EPIC` | the dependency is in another epic. Move it. |

## Rules

- Do not claim a blocked task.
- Do not update a done or cancelled task.
- Do not complete a task that is claimed. Release it first.
- Use cancel only for a task you will not do.
- Use release when you stop work on an in_progress task.