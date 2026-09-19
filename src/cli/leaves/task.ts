import type { Task } from "../../domain/types.ts";
import {
	addTaskDependency,
	approveTask,
	cancelTask,
	claimTask,
	completeTask,
	createTask,
	createTasksBatch,
	listTasks,
	nextTask,
	rejectTask,
	releaseTask,
	removeTaskDependency,
	showTask,
	submitTask,
	takeTask,
	updateTask,
} from "../../commands/task.ts";
import type { TaskDetail } from "../../services/queries.ts";
import { optBool, optList, optPositional, optStr } from "../args.ts";
import { kv, listSection, table } from "../output.ts";
import type { CommandLeaf } from "../types.ts";

const taskRows = (tasks: Task[]) =>
	tasks.map((t) => ({
		id: t.id,
		name: t.name,
		status: t.status,
		agent: t.assigned_agent ?? "",
	}));

const taskDetail: CommandLeaf = {
	path: "task create",
	spec: {
		epic: "value",
		name: "value",
		description: "value",
		"depends-on": "values",
	},
	usage:
		"task create --epic <epicId> --name <name> [--description <text>] [--depends-on <taskId>[,<taskId>...]]",
	summary: "Create a task in an epic",
	run: (ctx, parsed) =>
		createTask(ctx, {
			epic: optStr(parsed, "epic"),
			name: optStr(parsed, "name"),
			description: optStr(parsed, "description"),
			dependsOn: optList(parsed, "depends-on"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, [
			"name",
			"description",
			"status",
			"epic_id",
			"id",
			"created_at",
		]),
};

const taskBatch: CommandLeaf = {
	path: "task create batch",
	spec: { epic: "value", file: "value" },
	usage: "task create batch --epic <epicId> --file <path>",
	summary: "Bulk-create tasks from a JSON file (`--file -` reads stdin)",
	run: (ctx, parsed) =>
		createTasksBatch(ctx, {
			epic: optStr(parsed, "epic"),
			file: optStr(parsed, "file"),
		}),
	human: (data) => table(taskRows(data as Task[])),
};

const taskList: CommandLeaf = {
	path: "task list",
	spec: {
		epic: "value",
		status: "value",
		agent: "value",
		unassigned: "boolean",
	},
	usage:
		"task list [--epic <epicId>] [--status <status>] [--agent <agentId>] [--unassigned]",
	summary: "List tasks, optionally scoped to an epic",
	run: (ctx, parsed) =>
		listTasks(ctx, {
			epic: optStr(parsed, "epic"),
			status: optStr(parsed, "status"),
			agent: optStr(parsed, "agent"),
			unassigned: optBool(parsed, "unassigned"),
		}),
	human: (data) => table(taskRows(data as Task[])),
};

const taskShow: CommandLeaf = {
	path: "task show",
	spec: {},
	usage: "task show <taskId>",
	summary: "Show a task with deps, dependents and event history",
	run: (ctx, parsed) => showTask(ctx, optPositional(parsed, 0, "taskId")),
	human: (data) => {
		const d = data as TaskDetail;
		return [
			kv(d.task, [
				"name",
				"description",
				"status",
				"assigned_agent",
				"epic_id",
				"id",
				"created_at",
				"updated_at",
			]),
			`computed_status: ${d.computed_status}`,
			"",
			listSection(
				"dependencies",
				d.dependencies.map((x) => ({
					id: x.task_id,
					name: x.name,
					status: x.status,
				})),
			),
			"",
			listSection(
				"dependents",
				d.dependents.map((x) => ({
					id: x.task_id,
					name: x.name,
					status: x.status,
				})),
			),
		].join("\n");
	},
};

const taskUpdate: CommandLeaf = {
	path: "task update",
	spec: { name: "value", description: "value" },
	usage: "task update <taskId> [--name <name>] [--description <text>]",
	summary: "Edit a task's name or description",
	run: (ctx, parsed) =>
		updateTask(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			name: optStr(parsed, "name"),
			description: optStr(parsed, "description"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const taskNext: CommandLeaf = {
	path: "task next",
	spec: { epic: "value", agent: "value" },
	usage: "task next --epic <epicId> [--agent <agentId>]",
	summary: "Return the best unblocked, unassigned todo task (or null)",
	run: (ctx, parsed) =>
		nextTask(ctx, {
			epic: optStr(parsed, "epic") ?? "",
			agent: optStr(parsed, "agent"),
		}),
	human: (data) =>
		data
			? kv(data as Record<string, unknown>, ["id", "name", "status", "epic_id"])
			: "(nothing to do)",
};

const taskTake: CommandLeaf = {
	path: "task take",
	spec: { epic: "value", agent: "value" },
	usage: "task take --epic <epicId> [--agent <agentId>]",
	summary: "Atomically claim the next available task (or null)",
	run: (ctx, parsed) =>
		takeTask(ctx, {
			epic: optStr(parsed, "epic") ?? "",
			agent: optStr(parsed, "agent"),
		}),
	human: (data) =>
		data
			? kv(data as Record<string, unknown>, ["id", "name", "status", "epic_id"])
			: "(nothing to do)",
};

const claimed: CommandLeaf = {
	path: "task claim",
	spec: { agent: "value" },
	usage: "task claim <taskId> --agent <agentId>",
	summary: "Assign the task to an agent and mark it in_progress",
	run: (ctx, parsed) =>
		claimTask(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			agent: optStr(parsed, "agent") ?? "",
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, [
			"id",
			"name",
			"status",
			"assigned_agent",
		]),
};

const released: CommandLeaf = {
	path: "task release",
	spec: {},
	usage: "task release <taskId>",
	summary: "Unassign a task back to its computed status",
	run: (ctx, parsed) =>
		releaseTask(ctx, { taskId: optPositional(parsed, 0, "taskId") }),
	human: (data) =>
		kv(data as Record<string, unknown>, [
			"id",
			"name",
			"status",
			"assigned_agent",
		]),
};

const submitted: CommandLeaf = {
	path: "task submit",
	spec: { reviewer: "value" },
	usage: "task submit <taskId> [--reviewer <agentId>]",
	summary:
		"Send an in_progress task to in_review (optionally naming a reviewer)",
	run: (ctx, parsed) =>
		submitTask(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			reviewer: optStr(parsed, "reviewer"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const approved: CommandLeaf = {
	path: "task approve",
	spec: { as: "value" },
	usage: "task approve <taskId> [--as <reviewerAgentId>]",
	summary: "Approve an in_review task (reviewer passes --as to act)",
	run: (ctx, parsed) =>
		approveTask(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			as: optStr(parsed, "as"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const rejected: CommandLeaf = {
	path: "task reject",
	spec: { reason: "value", as: "value" },
	usage: "task reject <taskId> --reason <text> [--as <reviewerAgentId>]",
	summary: "Reject an in_review task back to in_progress",
	run: (ctx, parsed) =>
		rejectTask(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			reason: optStr(parsed, "reason"),
			as: optStr(parsed, "as"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const completed: CommandLeaf = {
	path: "task complete",
	spec: {},
	usage: "task complete <taskId>",
	summary: "Complete an unclaimed, unstarted task without the review flow",
	run: (ctx, parsed) =>
		completeTask(ctx, { taskId: optPositional(parsed, 0, "taskId") }),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const cancelled: CommandLeaf = {
	path: "task cancel",
	spec: { reason: "value" },
	usage: "task cancel <taskId> --reason <text>",
	summary: "Cancel a non-terminal task",
	run: (ctx, parsed) =>
		cancelTask(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			reason: optStr(parsed, "reason"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const depended: CommandLeaf = {
	path: "task depend",
	spec: { on: "value" },
	usage: "task depend <taskId> --on <dependsOnTaskId>",
	summary: "Add a finish-to-start dependency",
	run: (ctx, parsed) =>
		addTaskDependency(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			on: optStr(parsed, "on") ?? "",
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

const undepended: CommandLeaf = {
	path: "task undepend",
	spec: { on: "value" },
	usage: "task undepend <taskId> --on <dependsOnTaskId>",
	summary: "Remove a finish-to-start dependency",
	run: (ctx, parsed) =>
		removeTaskDependency(ctx, {
			taskId: optPositional(parsed, 0, "taskId"),
			on: optStr(parsed, "on") ?? "",
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, ["id", "name", "status"]),
};

export const leaves: CommandLeaf[] = [
	taskDetail,
	taskBatch,
	taskList,
	taskShow,
	taskUpdate,
	taskNext,
	taskTake,
	claimed,
	released,
	submitted,
	approved,
	rejected,
	completed,
	cancelled,
	depended,
	undepended,
];
