/** Next-step advice attached to error codes as `error.hint`. */
export const HINTS: Record<string, string> = {
	UNKNOWN_COMMAND: "Run `tempo --help` for the command list.",
	MISSING_ARGUMENT: "Run `tempo <command> --help` for usage.",
	INVALID_ARGUMENT: "Run `tempo <command> --help` for usage.",
	PROJECT_NOT_FOUND: "Run `tempo project list` to find the id.",
	EPIC_NOT_FOUND: "Run `tempo epic list --project <projectId>` to find the id.",
	TASK_NOT_FOUND: "Run `tempo task list --epic <epicId>` to find the id.",
	TASK_ALREADY_CLAIMED:
		"Another agent owns it. Run `tempo task take --epic <epicId>` to get different work.",
	TASK_BLOCKED:
		"A dependency is unfinished. Run `tempo task show <taskId>` to see which, and do that first.",
	INVALID_TRANSITION:
		"Run `tempo task show <taskId>` to see its current status.",
	NOT_REVIEWER:
		"A reviewer is designated. Pass `--as <reviewerId>` (or set TEMPO_AGENT).",
	SELF_REVIEW: "The reviewer must differ from the assignee. Pick another agent.",
	CYCLIC_DEPENDENCY:
		"That dependency would create a cycle. Remove one with `tempo task undepend`.",
	DEPENDENCY_NOT_SAME_EPIC: "Dependencies must be in the same epic.",
	PROJECT_NAME_TAKEN: "Run `tempo project list` and reuse the existing project.",
};
