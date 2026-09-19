import type { CommandContext } from "../../context.ts";
import type { Epic } from "../../domain/types.ts";
import { deriveEpicStatus } from "../../domain/states.ts";
import { createEpic, listEpics, showEpic } from "../../commands/epic.ts";
import type { EpicDetail } from "../../services/queries.ts";
import { optPositional, optStr } from "../args.ts";
import { kv, listSection, table } from "../output.ts";
import type { CommandLeaf } from "../types.ts";

const epicCreate: CommandLeaf = {
	path: "epic create",
	ids: { flags: { project: "project" } },
	spec: { project: "value", name: "value", description: "value" },
	usage:
		"epic create --project <projectId> --name <name> [--description <text>]",
	summary: "Create an epic inside a project",
	run: (ctx, parsed) =>
		createEpic(ctx, {
			project: optStr(parsed, "project"),
			name: optStr(parsed, "name"),
			description: optStr(parsed, "description"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, [
			"name",
			"description",
			"project_id",
			"id",
			"created_at",
		]),
};

function epicStatus(ctx: CommandContext, epicId: string): string {
	return deriveEpicStatus(ctx.tasks.findByEpic(epicId).map((t) => t.status));
}

const epicList: CommandLeaf = {
	path: "epic list",
	ids: { flags: { project: "project" } },
	spec: { project: "value" },
	usage: "epic list --project <projectId>",
	summary: "List epics in a project",
	run: (ctx, parsed) => listEpics(ctx, optStr(parsed, "project") ?? ""),
	human: (data, ctx) =>
		table(
			(data as Epic[]).map((e) => ({
				id: e.id,
				name: e.name,
				status: epicStatus(ctx as CommandContext, e.id),
				description: e.description ?? "",
			})),
		),
};

const epicShow: CommandLeaf = {
	path: "epic show",
	ids: { positional: "epic" },
	spec: {},
	usage: "epic show <epicId>",
	summary: "Show an epic with its tasks, dependency tree and derived status",
	run: (ctx, parsed) => showEpic(ctx, optPositional(parsed, 0, "epicId")),
	human: (data) => {
		const detail = data as EpicDetail;
		const summary = detail.summary;
		const lines = [
			kv(detail, [
				"name",
				"status",
				"description",
				"project_id",
				"id",
				"created_at",
				"updated_at",
			]),
			`summary: ${summary.total} tasks (${summary.todo} todo, ${summary.blocked} blocked, ${summary.in_progress} in_progress, ${summary.in_review} in_review, ${summary.done} done, ${summary.cancelled} cancelled, ${summary.percent_done}% done)`,
			"",
			listSection(
				"tasks",
				detail.tasks.map((t) => ({
					id: t.id,
					name: t.name,
					status: t.status,
					agent: t.assigned_agent ?? "",
					blocked_by: t.dependencies.join(","),
				})),
			),
		];
		return lines.join("\n");
	},
};

export const leaves: CommandLeaf[] = [epicCreate, epicList, epicShow];
