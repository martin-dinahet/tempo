export type TaskStatus =
	| "todo"
	| "blocked"
	| "in_progress"
	| "in_review"
	| "done"
	| "cancelled";

export type EpicStatus = "not_started" | "in_progress" | "done" | "empty";

export type EntityType = "project" | "epic" | "task";

export const TASK_STATUSES = [
	"todo",
	"blocked",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
] as const;

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
	"done",
	"cancelled",
]);

export const UNSTARTED_STATUSES: ReadonlySet<TaskStatus> = new Set([
	"todo",
	"blocked",
]);

export interface Project {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
}

export interface Epic {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
}

export interface Task {
	id: string;
	epic_id: string;
	name: string;
	description: string | null;
	status: TaskStatus;
	assigned_agent: string | null;
	reviewer: string | null;
	created_at: string;
	updated_at: string;
}

export interface TaskDependency {
	task_id: string;
	depends_on_task_id: string;
}

export interface AppEvent {
	id: string;
	entity_type: EntityType;
	entity_id: string;
	event_type: string;
	payload: Record<string, unknown>;
	actor: string;
	created_at: string;
}

export function isTaskStatus(value: unknown): value is TaskStatus {
	return (
		typeof value === "string" &&
		(TASK_STATUSES as readonly string[]).includes(value)
	);
}
