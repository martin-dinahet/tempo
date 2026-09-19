import { readFileSync } from "node:fs";
import { z } from "zod";
import type { CommandContext } from "../context.ts";
import { recordEvent } from "../context.ts";
import { appError } from "../domain/errors.ts";
import {
	allowedTransition,
	effectiveStatus,
	isCancellable,
} from "../domain/states.ts";
import {
	hasIncompleteDependency,
	wouldCreateCycle,
} from "../domain/dependencies.ts";
import type { Task, TaskStatus } from "../domain/types.ts";
import { getTaskDetail } from "../services/queries.ts";

const createSchema = z.object({
	epic: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	dependsOn: z.array(z.string().min(1)).optional(),
});

const listSchema = z.object({
	epic: z.string().min(1).optional(),
	status: z.string().optional(),
	agent: z.string().optional(),
	unassigned: z.boolean().optional(),
});

const createBatchSchema = z.object({
	epic: z.string().min(1),
	file: z.string().min(1),
});

const batchEntrySchema = z.object({
	ref: z.string().min(1).optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	dependsOn: z.array(z.string().min(1)).optional(),
});

const batchDocSchema = z.union([
	z.object({ tasks: z.array(batchEntrySchema) }),
	z.array(batchEntrySchema),
]);

const dependSchema = z.object({
	taskId: z.string().min(1),
	on: z.string().min(1),
});

export interface CreateTaskInput {
	epic: string;
	name: string;
	description?: string;
	dependsOn?: string[];
	actor?: string;
}

export interface ListTasksInput {
	epic?: string;
	status?: TaskStatus;
	agent?: string;
	unassigned?: boolean;
}

export function createTask(ctx: CommandContext, input: unknown): Task {
	const parsed = createSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { epic, name, description, dependsOn } = parsed.data;

	if (!ctx.epics.findById(epic)) {
		throw appError("EPIC_NOT_FOUND", `epic not found: ${epic}`);
	}

	const now = ctx.now();
	const task: Task = {
		id: ctx.newId(),
		epic_id: epic,
		name,
		description: description ?? null,
		status: "todo",
		assigned_agent: null,
		reviewer: null,
		created_at: now,
		updated_at: now,
	};

	ctx.tx(() => {
		ctx.tasks.create(task);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: task.id,
			event_type: "task.created",
			payload: { epic_id: epic, name, description: description ?? null },
		});
		for (const dependsOnTaskId of dependsOn ?? []) {
			addTaskDependency(ctx, { taskId: task.id, on: dependsOnTaskId });
		}
	});

	return requireTask(ctx, task.id);
}

export interface CreateTasksBatchInput {
	epic: string;
	file: string;
}

export function createTasksBatch(ctx: CommandContext, input: unknown): Task[] {
	const parsed = createBatchSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { epic, file } = parsed.data;

	if (!ctx.epics.findById(epic)) {
		throw appError("EPIC_NOT_FOUND", `epic not found: ${epic}`);
	}

	const source = file === "-" ? "stdin" : file;
	let raw: string;
	try {
		raw = readFileSync(file === "-" ? 0 : file, "utf8");
	} catch {
		throw appError("INVALID_ARGUMENT", `cannot read ${source}`);
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw appError("INVALID_ARGUMENT", `can't parse JSON from ${source}`);
	}
	const doc = batchDocSchema.safeParse(json);
	if (!doc.success)
		throw appError(
			"INVALID_ARGUMENT",
			doc.error.issues.map((i) => i.message).join("; "),
		);
	const entries = Array.isArray(doc.data) ? doc.data : doc.data.tasks;

	const seenRefs = new Set<string>();
	for (const entry of entries) {
		if (entry.ref !== undefined) {
			if (seenRefs.has(entry.ref)) {
				throw appError(
					"INVALID_ARGUMENT",
					`duplicate ref in batch: '${entry.ref}'`,
				);
			}
			seenRefs.add(entry.ref);
		}
	}

	return ctx.tx(() => {
		const now = ctx.now();
		const idMap = new Map<string, string>();
		const tasks = entries.map((entry) => {
			const task: Task = {
				id: ctx.newId(),
				epic_id: epic,
				name: entry.name,
				description: entry.description ? entry.description : null,
				status: "todo",
				assigned_agent: null,
				reviewer: null,
				created_at: now,
				updated_at: now,
			};
			ctx.tasks.create(task);
			const payload: Record<string, unknown> = {
				epic_id: epic,
				name: entry.name,
				description: task.description,
			};
			if (entry.ref !== undefined) payload.ref = entry.ref;
			recordEvent(ctx, {
				entity_type: "task",
				entity_id: task.id,
				event_type: "task.created",
				payload,
			});
			idMap.set(task.id, task.id);
			if (entry.ref !== undefined) idMap.set(entry.ref, task.id);
			return task;
		});

		entries.forEach((entry, index) => {
			const taskId = tasks[index]!.id;
			for (const dep of entry.dependsOn ?? []) {
				const resolved = idMap.get(dep);
				if (resolved !== undefined) {
					addTaskDependency(ctx, { taskId, on: resolved });
				} else if (ctx.tasks.findById(dep)) {
					addTaskDependency(ctx, { taskId, on: dep });
				} else {
					throw appError(
						"INVALID_ARGUMENT",
						`unresolved ref in dependsOn: '${dep}'`,
					);
				}
			}
		});

		return tasks.map((task) => requireTask(ctx, task.id));
	});
}

export function listTasks(ctx: CommandContext, input: unknown): Task[] {
	const parsed = listSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { epic, status, agent, unassigned } = parsed.data;

	if (epic !== undefined && !ctx.epics.findById(epic)) {
		throw appError("EPIC_NOT_FOUND", `epic not found: ${epic}`);
	}

	return ctx.tasks.findByEpic(epic, {
		status: status as TaskStatus | undefined,
		agent,
		unassigned,
	});
}

export function showTask(
	ctx: CommandContext,
	taskId: string,
): ReturnType<typeof getTaskDetail> {
	return getTaskDetail(ctx, taskId);
}

const updateSchema = z.object({
	taskId: z.string().min(1),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
});

export function updateTask(ctx: CommandContext, input: unknown): Task {
	const parsed = updateSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, name, description } = parsed.data;

	if (name === undefined && description === undefined) {
		throw appError(
			"INVALID_ARGUMENT",
			"task update requires at least --name or --description",
		);
	}

	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		if (task.status === "done" || task.status === "cancelled") {
			throw appError(
				"INVALID_TRANSITION",
				`cannot update task '${taskId}' in terminal state '${task.status}'`,
			);
		}
		const changes: { name?: string; description?: string | null } = {};
		const payload: Record<string, unknown> = {};
		if (name !== undefined) {
			changes.name = name;
			payload.name = name;
		}
		if (description !== undefined) {
			changes.description = description === "" ? null : description;
			payload.description = changes.description;
		}
		ctx.tasks.updateDetails(taskId, changes, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.updated",
			payload,
		});
		return requireTask(ctx, taskId);
	});
}

const nextSchema = z.object({
	epic: z.string().min(1),
	agent: z.string().optional(),
});

export interface NextTaskInput {
	epic: string;
	agent?: string;
}

/** The primary "give me work" command: oldest unblocked, unassigned todo task. */
export function nextTask(ctx: CommandContext, input: unknown): Task | null {
	const parsed = nextSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { epic, agent } = parsed.data;

	if (!ctx.epics.findById(epic)) {
		throw appError("EPIC_NOT_FOUND", `epic not found: ${epic}`);
	}

	return ctx.tasks.next(epic, agent === undefined ? undefined : agent);
}

const takeSchema = z.object({
	epic: z.string().min(1),
	agent: z.string().optional(),
});

export function takeTask(ctx: CommandContext, input: unknown): Task | null {
	const parsed = takeSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { epic, agent } = parsed.data;

	if (!ctx.epics.findById(epic)) {
		throw appError("EPIC_NOT_FOUND", `epic not found: ${epic}`);
	}

	return ctx.tx(() => {
		const task = nextTask(ctx, { epic, agent });
		if (!task) return null;
		return claimTask(ctx, { taskId: task.id, agent: agent ?? "human" });
	});
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const claimSchema = z.object({
	taskId: z.string().min(1),
	agent: z.string().min(1),
	actor: z.string().optional(),
});

const reasonSchema = z.object({
	taskId: z.string().min(1),
	reason: z.string().min(1),
});

const statusSchema = z.object({
	taskId: z.string().min(1),
});

const completeSchema = z.object({
	taskId: z.string().min(1),
});

const submitSchema = z.object({
	taskId: z.string().min(1),
	reviewer: z.string().optional(),
});

const reviewSchema = z.object({
	taskId: z.string().min(1),
	as: z.string().optional(),
});

const rejectReviewSchema = z.object({
	taskId: z.string().min(1),
	as: z.string().optional(),
	reason: z.string().min(1),
});

function requireTask(ctx: CommandContext, taskId: string): Task {
	const task = ctx.tasks.findById(taskId);
	if (!task) throw appError("TASK_NOT_FOUND", `task not found: ${taskId}`);
	return task;
}

function touchEpic(ctx: CommandContext, epicId: string): void {
	ctx.epics.touch(epicId, ctx.now());
}

function assertReviewer(task: Task, actor: string | undefined): void {
	if (task.reviewer === null) return;
	if (actor === undefined || actor !== task.reviewer) {
		throw appError(
			"NOT_REVIEWER",
			`task '${task.id}' is designated for review by '${task.reviewer}'`,
		);
	}
	if (task.assigned_agent !== null && actor === task.assigned_agent) {
		throw appError(
			"SELF_REVIEW",
			"a task's reviewer must differ from its assignee",
		);
	}
}

function dependencyStatuses(ctx: CommandContext, taskId: string): TaskStatus[] {
	return ctx.dependencies
		.dependencyIds(taskId)
		.map((id) => ctx.tasks.findById(id))
		.map((t) => (t ? t.status : "cancelled"));
}

export function claimTask(ctx: CommandContext, input: unknown): Task {
	const parsed = claimSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, agent } = parsed.data;
	const actor = parsed.data.actor ?? agent;

	return ctx.tx(() => {
		requireTask(ctx, taskId);
		const claimed = ctx.tasks.claimIfAvailable(taskId, agent, ctx.now());
		if (!claimed) {
			const fresh = requireTask(ctx, taskId);
			if (fresh.status === "in_progress" && fresh.assigned_agent) {
				throw appError(
					"TASK_ALREADY_CLAIMED",
					`task '${taskId}' was already claimed by '${fresh.assigned_agent}'`,
				);
			}
			if (hasIncompleteDependency(dependencyStatuses(ctx, taskId))) {
				throw appError(
					"TASK_BLOCKED",
					`task '${taskId}' is blocked by an incomplete dependency`,
				);
			}
			throw appError(
				"INVALID_TRANSITION",
				`task '${taskId}' is in state '${fresh.status}' and cannot be claimed`,
			);
		}
		const task = requireTask(ctx, taskId);
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.claimed",
			actor,
			payload: { agent, from: "todo" },
		});
		return task;
	});
}

export function releaseTask(ctx: CommandContext, input: unknown): Task {
	const parsed = statusSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId } = parsed.data;

	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		if (task.status !== "in_progress") {
			throw appError(
				"INVALID_TRANSITION",
				`task '${taskId}' is in state '${task.status}' and cannot be released`,
			);
		}
		const target = effectiveStatus("todo", dependencyStatuses(ctx, taskId));
		const agent = task.assigned_agent;
		ctx.tasks.updateStatusAndAssignee(taskId, target, null, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.released",
			payload: { agent, to: target },
		});
		return requireTask(ctx, taskId);
	});
}

export function submitTask(ctx: CommandContext, input: unknown): Task {
	const parsed = submitSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, reviewer } = parsed.data;

	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		if (task.status !== "in_progress") {
			throw appError(
				"INVALID_TRANSITION",
				`cannot transition task ${taskId} from '${task.status}' to 'in_review'`,
			);
		}
		if (
			reviewer !== undefined &&
			task.assigned_agent !== null &&
			reviewer === task.assigned_agent
		) {
			throw appError(
				"SELF_REVIEW",
				"a task's reviewer must differ from its assignee",
			);
		}
		ctx.tasks.submitForReview(taskId, reviewer ?? null, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.submitted",
			payload: {
				from: "in_progress",
				to: "in_review",
				reviewer: reviewer ?? null,
			},
		});
		return requireTask(ctx, taskId);
	});
}

export function approveTask(ctx: CommandContext, input: unknown): Task {
	const parsed = reviewSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, as } = parsed.data;

	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		assertReviewer(task, as);
		if (!allowedTransition(task.status, "done")) {
			throw appError(
				"INVALID_TRANSITION",
				`cannot approve task '${task.id}' from state '${task.status}'`,
			);
		}
		ctx.tasks.updateStatusAndAssignee(task.id, "done", null, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: task.id,
			event_type: "task.approved",
			actor: as ?? ctx.actor,
			payload: { from: task.status, to: "done", by: as ?? null },
		});
		recomputeBlockedDependents(ctx, task.id);
		return requireTask(ctx, task.id);
	});
}

export function completeTask(ctx: CommandContext, input: unknown): Task {
	const parsed = completeSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId } = parsed.data;

	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		if (task.status !== "todo") {
			let message: string;
			if (task.status === "blocked") {
				message = `task '${taskId}' is blocked by an incomplete dependency; unblock it first`;
			} else if (task.status === "in_progress" && task.assigned_agent) {
				message = `task '${taskId}' is claimed by '${task.assigned_agent}'; release it first`;
			} else {
				message = `task '${taskId}' is in state '${task.status}' and cannot be completed`;
			}
			throw appError("INVALID_TRANSITION", message);
		}
		ctx.tasks.updateStatusAndAssignee(taskId, "done", null, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.completed",
			payload: { from: "todo", to: "done" },
		});
		recomputeBlockedDependents(ctx, taskId);
		return requireTask(ctx, taskId);
	});
}

export function rejectTask(ctx: CommandContext, input: unknown): Task {
	const parsed = rejectReviewSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, as, reason } = parsed.data;

	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		assertReviewer(task, as);
		if (!allowedTransition(task.status, "in_progress")) {
			throw appError(
				"INVALID_TRANSITION",
				`cannot transition task ${taskId} from '${task.status}' to 'in_progress'`,
			);
		}
		ctx.tasks.takeBackFromReview(taskId, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.rejected",
			actor: as ?? ctx.actor,
			payload: { from: "in_review", to: "in_progress", reason, by: as ?? null },
		});
		return requireTask(ctx, taskId);
	});
}

export function cancelTask(ctx: CommandContext, input: unknown): Task {
	const parsed = reasonSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, reason } = parsed.data;
	return ctx.tx(() => {
		const task = requireTask(ctx, taskId);
		if (!isCancellable(task.status)) {
			throw appError(
				"INVALID_TRANSITION",
				`cannot cancel task '${taskId}' from terminal state '${task.status}'`,
			);
		}
		ctx.tasks.updateStatusAndAssignee(taskId, "cancelled", null, ctx.now());
		touchEpic(ctx, task.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.cancelled",
			payload: { from: task.status, to: "cancelled", reason },
		});
		recomputeBlockedDependents(ctx, taskId);
		return requireTask(ctx, taskId);
	});
}

/**
 * When a task becomes `done` or `cancelled`, recompute the stored status of
 * every task that directly depends on it (a cancelled dependency still counts
 * as "not done", so its dependents stay blocked).
 */
function recomputeBlockedDependents(ctx: CommandContext, taskId: string): void {
	for (const dependentId of ctx.dependencies.dependentIds(taskId)) {
		const dependent = ctx.tasks.findById(dependentId);
		if (!dependent) continue;
		if (dependent.status !== "todo" && dependent.status !== "blocked") continue;
		const stored = effectiveStatus(
			"todo",
			dependencyStatuses(ctx, dependentId),
		);
		if (stored !== dependent.status) {
			ctx.tasks.updateStatus(dependentId, stored, ctx.now());
			touchEpic(ctx, dependent.epic_id);
			recordEvent(ctx, {
				entity_type: "task",
				entity_id: dependentId,
				event_type: stored === "todo" ? "task.unblocked" : "task.blocked",
				payload: {
					from: dependent.status,
					to: stored,
					reason: `dependency '${taskId}' is now ${stored === "todo" ? "done" : "cancelled"}`,
				},
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export function addTaskDependency(ctx: CommandContext, input: unknown): Task {
	const parsed = dependSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, on: depId } = parsed.data;

	return ctx.tx(() => {
		const dependent = requireTask(ctx, taskId);
		const dependency = requireTask(ctx, depId);

		if (dependent.epic_id !== dependency.epic_id) {
			throw appError(
				"DEPENDENCY_NOT_SAME_EPIC",
				`cannot link task '${taskId}' to '${depId}': dependencies only connect tasks within the same epic`,
			);
		}
		if (dependent.status !== "todo" && dependent.status !== "blocked") {
			throw appError(
				"INVALID_TRANSITION",
				`task '${taskId}' is '${dependent.status}'; dependencies (finish-to-start) can only be declared on unstarted tasks`,
			);
		}
		if (ctx.dependencies.exists(taskId, depId)) return dependent;

		if (
			wouldCreateCycle(taskId, depId, (id) =>
				ctx.dependencies.dependencyIds(id),
			)
		) {
			throw appError(
				"CYCLIC_DEPENDENCY",
				`adding '${taskId}' depends-on '${depId}' would create a cycle`,
			);
		}

		ctx.dependencies.add(taskId, depId);
		touchEpic(ctx, dependent.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.depend_added",
			payload: { depends_on: depId },
		});

		if (dependency.status !== "done" && dependent.status === "todo") {
			ctx.tasks.updateStatus(taskId, "blocked", ctx.now());
			recordEvent(ctx, {
				entity_type: "task",
				entity_id: taskId,
				event_type: "task.blocked",
				payload: {
					from: "todo",
					to: "blocked",
					reason: `dependency '${depId}' is not done`,
				},
			});
		}

		return requireTask(ctx, taskId);
	});
}

export function removeTaskDependency(
	ctx: CommandContext,
	input: unknown,
): Task {
	const parsed = dependSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { taskId, on: depId } = parsed.data;

	return ctx.tx(() => {
		const dependent = requireTask(ctx, taskId);
		requireTask(ctx, depId);

		if (!ctx.dependencies.exists(taskId, depId)) return dependent;

		ctx.dependencies.remove(taskId, depId);
		touchEpic(ctx, dependent.epic_id);
		recordEvent(ctx, {
			entity_type: "task",
			entity_id: taskId,
			event_type: "task.depend_removed",
			payload: { depends_on: depId },
		});

		if (dependent.status === "blocked") {
			const computed = effectiveStatus("todo", dependencyStatuses(ctx, taskId));
			if (computed === "todo") {
				ctx.tasks.updateStatus(taskId, "todo", ctx.now());
				recordEvent(ctx, {
					entity_type: "task",
					entity_id: taskId,
					event_type: "task.unblocked",
					payload: {
						from: "blocked",
						to: "todo",
						reason: `dependency '${depId}' removed`,
					},
				});
			}
		}

		return requireTask(ctx, taskId);
	});
}
