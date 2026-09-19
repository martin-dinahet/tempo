import { z } from "zod";
import type { CommandContext } from "../context.ts";
import { recordEvent } from "../context.ts";
import { appError } from "../domain/errors.ts";
import type { Epic } from "../domain/types.ts";
import { getEpicDetail } from "../services/queries.ts";

const createSchema = z.object({
	project: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
});

export interface CreateEpicInput {
	project: string;
	name: string;
	description?: string;
}

export function createEpic(ctx: CommandContext, input: unknown): Epic {
	const parsed = createSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { project, name, description } = parsed.data;

	if (!ctx.projects.findById(project)) {
		throw appError("PROJECT_NOT_FOUND", `project not found: ${project}`);
	}

	const now = ctx.now();
	const epic: Epic = {
		id: ctx.newId(),
		project_id: project,
		name,
		description: description ?? null,
		created_at: now,
		updated_at: now,
	};

	ctx.tx(() => {
		ctx.epics.create(epic);
		recordEvent(ctx, {
			entity_type: "epic",
			entity_id: epic.id,
			event_type: "epic.created",
			payload: { project_id: project, name, description: description ?? null },
		});
	});

	return epic;
}

export function listEpics(ctx: CommandContext, projectId: string): Epic[] {
	if (!ctx.projects.findById(projectId)) {
		throw appError("PROJECT_NOT_FOUND", `project not found: ${projectId}`);
	}
	return ctx.epics.findByProject(projectId);
}

export function showEpic(
	ctx: CommandContext,
	epicId: string,
): ReturnType<typeof getEpicDetail> {
	return getEpicDetail(ctx, epicId);
}
