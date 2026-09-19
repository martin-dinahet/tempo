import type { Project } from "../../domain/types.ts";
import {
	createProject,
	listProjects,
	showProject,
} from "../../commands/project.ts";
import { optPositional, optStr } from "../args.ts";
import { kv, table } from "../output.ts";
import type { CommandLeaf } from "../types.ts";

const projectCreate: CommandLeaf = {
	path: "project create",
	spec: { name: "value", description: "value" },
	usage: "project create --name <name> [--description <text>]",
	summary: "Create a project",
	run: (ctx, parsed) =>
		createProject(ctx, {
			name: optStr(parsed, "name"),
			description: optStr(parsed, "description"),
		}),
	human: (data) =>
		kv(data as Record<string, unknown>, [
			"name",
			"description",
			"id",
			"created_at",
		]),
};

const projectList: CommandLeaf = {
	path: "project list",
	spec: {},
	usage: "project list",
	summary: "List all projects",
	run: (ctx) => listProjects(ctx),
	human: (data) =>
		table(
			(data as Project[]).map((p) => ({
				id: p.id,
				name: p.name,
				description: p.description ?? "",
			})),
		),
};

const projectShow: CommandLeaf = {
	path: "project show",
	ids: { positional: "project" },
	spec: {},
	usage: "project show <projectId>",
	summary: "Show a project and its epics",
	run: (ctx, parsed) => showProject(ctx, optPositional(parsed, 0, "projectId")),
	human: (data) => {
		const p = data as Record<string, unknown> & {
			epics: Array<{ id: string; name: string }>;
		};
		return [
			kv(p, ["id", "name", "description", "created_at"]),
			"",
			table(p.epics.map((e) => ({ id: e.id, name: e.name }))),
		].join("\n");
	},
};

export const leaves: CommandLeaf[] = [projectCreate, projectList, projectShow];
