import { z } from "zod";
import type { CommandContext } from "../context.ts";
import { recordEvent } from "../context.ts";
import { appError } from "../domain/errors.ts";
import type { Project } from "../domain/types.ts";

export const createProjectSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
});

export interface CreateProjectInput {
	name: string;
	description?: string;
}

export function createProject(ctx: CommandContext, input: unknown): Project {
	const parsed = createProjectSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { name, description } = parsed.data;

	if (ctx.projects.findByName(name)) {
		throw appError(
			"PROJECT_NAME_TAKEN",
			`a project named '${name}' already exists`,
		);
	}

	const project: Project = {
		id: ctx.newId(),
		name,
		description: description ?? null,
		created_at: ctx.now(),
	};

	ctx.tx(() => {
		ctx.projects.create(project);
		recordEvent(ctx, {
			entity_type: "project",
			entity_id: project.id,
			event_type: "project.created",
			payload: { name, description: description ?? null },
		});
	});

	return project;
}

export function listProjects(ctx: CommandContext): Project[] {
	return ctx.projects.findAll();
}

export function showProject(
	ctx: CommandContext,
	id: string,
): Project & { epics: unknown[] } {
	const project = ctx.projects.findById(id);
	if (!project) throw appError("PROJECT_NOT_FOUND", `project not found: ${id}`);
	const epics = ctx.epics.findByProject(id);
	return { ...project, epics };
}
