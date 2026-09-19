import { z } from "zod";
import type { CommandContext } from "../context.ts";
import { appError } from "../domain/errors.ts";
import type { AppEvent } from "../domain/types.ts";

const listSchema = z.object({
	epic: z.string().min(1),
	entity: z.string().optional(),
	limit: z.number().int().positive().optional(),
});

export interface ListEventsInput {
	epic: string;
	entity?: string;
	limit?: number;
}

export function listEvents(ctx: CommandContext, input: unknown): AppEvent[] {
	const parsed = listSchema.safeParse(input);
	if (!parsed.success)
		throw appError(
			"INVALID_ARGUMENT",
			parsed.error.issues.map((i) => i.message).join("; "),
		);
	const { epic, entity, limit } = parsed.data;

	if (!ctx.epics.findById(epic)) {
		throw appError("EPIC_NOT_FOUND", `epic not found: ${epic}`);
	}
	if (entity && !ctx.tasks.findById(entity)) {
		throw appError("TASK_NOT_FOUND", `task not found: ${entity}`);
	}

	return ctx.events.listByEpic(epic, { entityId: entity, limit });
}
