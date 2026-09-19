import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import type {
	DependencyRepository,
	EpicRepository,
	EventRepository,
	ProjectRepository,
	TaskRepository,
} from "./repositories/types.ts";
import {
	SqliteDependencyRepository,
	SqliteEpicRepository,
	SqliteEventRepository,
	SqliteProjectRepository,
	SqliteTaskRepository,
	makeTransaction,
} from "./repositories/sqlite.ts";

export interface CommandContext {
	projects: ProjectRepository;
	epics: EpicRepository;
	tasks: TaskRepository;
	dependencies: DependencyRepository;
	events: EventRepository;
	/** Run a unit of work atomically (state changes + event emission). */
	tx: <T>(fn: () => T) => T;
	newId(): string;
	now(): string;
	/** Default actor recorded on events ("human" for the CLI). */
	actor: string;
}

export function createContext(
	db: Database,
	now: () => string = () => new Date().toISOString(),
	actor = "human",
): CommandContext {
	return {
		projects: new SqliteProjectRepository(db),
		epics: new SqliteEpicRepository(db),
		tasks: new SqliteTaskRepository(db),
		dependencies: new SqliteDependencyRepository(db),
		events: new SqliteEventRepository(db),
		tx: makeTransaction(db),
		newId: () => randomUUID(),
		now,
		actor,
	};
}

export type EventInput = {
	entity_type: "project" | "epic" | "task";
	entity_id: string;
	event_type: string;
	payload?: Record<string, unknown>;
	actor?: string;
};

/** Convenience: record an Event through the injected context + clock. */
export function recordEvent(ctx: CommandContext, input: EventInput): void {
	ctx.events.create({
		id: ctx.newId(),
		entity_type: input.entity_type,
		entity_id: input.entity_id,
		event_type: input.event_type,
		payload: input.payload ?? {},
		actor: input.actor ?? ctx.actor,
		created_at: ctx.now(),
	});
}
