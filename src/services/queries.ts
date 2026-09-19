import type { CommandContext } from "../context.ts";
import type { AppEvent, Task, TaskStatus } from "../domain/types.ts";
import { appError } from "../domain/errors.ts";
import { deriveEpicStatus, effectiveStatus } from "../domain/states.ts";

export interface TaskWithGraph extends Task {
	dependencies: string[];
	dependency_statuses: Record<string, TaskStatus>;
	dependents: string[];
}

export interface EpicSummary {
	total: number;
	todo: number;
	blocked: number;
	in_progress: number;
	in_review: number;
	done: number;
	cancelled: number;
	percent_done: number;
}

export interface EpicDetail {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
	status: ReturnType<typeof deriveEpicStatus>;
	summary: EpicSummary;
	tasks: TaskWithGraph[];
	/** dependency_tree[k] lists tasks that k depends on. */
	dependency_tree: Record<string, string[]>;
}

export function getEpicDetail(ctx: CommandContext, epicId: string): EpicDetail {
	const epic = ctx.epics.findById(epicId);
	if (!epic) throw appError("EPIC_NOT_FOUND", `epic not found: ${epicId}`);

	const tasks = ctx.tasks.findByEpic(epicId);
	const edges = ctx.dependencies.edgesForEpic(epicId);
	const byId = new Map(tasks.map((t) => [t.id, t]));

	const tasksWithGraph: TaskWithGraph[] = tasks.map((task) => {
		const dependencies = edges.get(task.id) ?? [];
		const dependency_statuses: Record<string, TaskStatus> = {};
		for (const depId of dependencies) {
			const dep = byId.get(depId);
			dependency_statuses[depId] = dep
				? dep.status
				: (dependency_statuses[depId] ?? "cancelled");
		}
		const dependents: string[] = [];
		for (const [dependent, deps] of edges) {
			if (deps.includes(task.id)) dependents.push(dependent);
		}
		return { ...task, dependencies, dependency_statuses, dependents };
	});

	const status = deriveEpicStatus(tasks.map((t) => t.status));
	const dependency_tree: Record<string, string[]> = {};
	for (const [dependent, deps] of edges) dependency_tree[dependent] = deps;

	const total = tasks.length;
	const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;
	const done = count("done");
	const summary: EpicSummary = {
		total,
		todo: count("todo"),
		blocked: count("blocked"),
		in_progress: count("in_progress"),
		in_review: count("in_review"),
		done,
		cancelled: count("cancelled"),
		percent_done: total === 0 ? 0 : Math.round((done / total) * 100),
	};

	return { ...epic, status, summary, tasks: tasksWithGraph, dependency_tree };
}

export interface TaskDetail {
	task: Task;
	dependencies: Array<{ task_id: string; name: string; status: TaskStatus }>;
	dependents: Array<{ task_id: string; name: string; status: TaskStatus }>;
	events: AppEvent[];
	computed_status: TaskStatus;
}

export function getTaskDetail(ctx: CommandContext, taskId: string): TaskDetail {
	const task = ctx.tasks.findById(taskId);
	if (!task) throw appError("TASK_NOT_FOUND", `task not found: ${taskId}`);

	const dependencyIds = ctx.dependencies.dependencyIds(taskId);
	const dependentIds = ctx.dependencies.dependentIds(taskId);
	const byId = (id: string) => ctx.tasks.findById(id);

	const mapEdge = (ids: string[]) =>
		ids
			.map(byId)
			.filter((t): t is Task => t !== null)
			.map((t) => ({ task_id: t.id, name: t.name, status: t.status }));

	return {
		task,
		dependencies: mapEdge(dependencyIds),
		dependents: mapEdge(dependentIds),
		events: ctx.events.listByEntity(taskId),
		computed_status: effectiveStatus(
			task.status,
			dependencyIds.map((id) => byId(id)?.status ?? "cancelled"),
		),
	};
}
