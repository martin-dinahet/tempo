import type { EpicStatus, TaskStatus } from "./types.ts";
import { TERMINAL_STATUSES } from "./types.ts";

export const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
	todo: ["in_progress", "cancelled"],
	blocked: ["cancelled"],
	in_progress: ["in_review", "cancelled"],
	in_review: ["in_progress", "done", "cancelled"],
	done: [],
	cancelled: [],
};

export function allowedTransition(from: TaskStatus, to: TaskStatus): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}

/** `cancel` is valid from any non-terminal state. */
export function isCancellable(status: TaskStatus): boolean {
	return !TERMINAL_STATUSES.has(status);
}

export function isTerminal(status: TaskStatus): boolean {
	return TERMINAL_STATUSES.has(status);
}

/**
 * The `blocked` vs `todo` split is computed, never stored directly.
 * A task that hasn't started yet (stored as `todo`/`blocked`) is `blocked`
 * when any of its dependencies is not `done`; otherwise it surfaces as `todo`.
 */
export function effectiveStatus(
	stored: TaskStatus,
	dependencyStatuses: readonly TaskStatus[],
): TaskStatus {
	if (stored !== "todo" && stored !== "blocked") return stored;
	const blocked = dependencyStatuses.some((s) => s !== "done");
	return blocked ? "blocked" : "todo";
}

export function deriveEpicStatus(
	taskStatuses: readonly TaskStatus[],
): EpicStatus {
	if (taskStatuses.length === 0) return "empty";
	const anyActive = taskStatuses.some(
		(s) => s === "in_progress" || s === "in_review",
	);
	if (anyActive) return "in_progress";
	const allFinished = taskStatuses.every(
		(s) => s === "done" || s === "cancelled",
	);
	if (allFinished) return "done";
	return "not_started";
}
