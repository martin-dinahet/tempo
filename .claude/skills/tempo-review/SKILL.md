---
name: tempo-review
description: Review one tempo task as a subagent. Use only when the orchestrator tells you to review a tempo task.
user-invocable: false
---

# Review a tempo task

You review one task. Then you stop.

## Steps

1. Run `tempo task show <taskId>`. Read the name and the description. If the status is not `in_review`, stop and report it.
2. Read the report of the implementer. Read the files that it changed.
3. Find the validation steps of this repo. Read the scripts in `package.json`, the README, and `CLAUDE.md`. The steps can be tests, type check, lint, and build.
4. Run every validation step. Do not skip a step. Make sure that each step passes.
5. Compare the work with the description. Check three points:
   - The work does what the description says.
   - A test covers each new behavior.
   - The work stays inside the slice.
6. Decide.
   - If all validation steps pass and all three points are true, run `tempo task approve <taskId> --as <reviewerId>`.
   - Otherwise, run `tempo task reject <taskId> --reason <text> --as <reviewerId>`. In the reason, say what to fix.
7. Report your decision and the reason.

## Rules

- Use the reviewer id from the orchestrator. Do not make an id.
- Do not change the code. Do not fix the work yourself.
- Reject only for a false point or a failing validation step. Do not reject for style.
- If a step fails in a file that the implementer did not change, report it. Do not reject for it.
