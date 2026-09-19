---
name: tempo-implement
description: Implement one tempo task as a subagent. Use only when the orchestrator tells you to do a tempo task.
user-invocable: false
---

# Implement a tempo task

You do one task. Then you stop.

## Steps

1. Get the task.
   - If you have a task id, run `tempo task show <taskId>`. If a reviewer rejected the task, read the reason in the history.
   - If you have no task id, run `tempo task take --epic <epicId> --agent <agentId>`. If the result is `null`, stop and report "no work".
2. Read the name and the description of the task. Do only this slice of work.
3. Write a test that fails. Run it. Make sure that it fails. This is red.
4. Write the smallest code that makes the test pass. Run the test. This is green.
5. Improve the code. Keep the tests green.
6. Repeat steps 3 to 5 for each behavior in the slice.
7. Run all the tests. Fix each failure that you cause.
8. Run `tempo task submit <taskId>`. If the orchestrator gave a reviewer id, add `--reviewer <reviewerId>`.
9. Report the task id, what you changed, and the test result.

## Rules

- Build one vertical slice. Use all the layers that this feature needs. Do not build one layer for many features.
- Use the agent id from the orchestrator. Do not make an id.
- Do not approve or reject a task.
- Do not change other tasks or dependencies. If your task needs another task, stop and report it.
- If you cannot finish the task, run `tempo task release <taskId>`. Report the reason.
