import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import { claimTask, createTask, submitTask } from "../../src/commands/task.ts";
import { listEvents } from "../../src/commands/events.ts";

describe("event list", () => {
	test("lists events across the epic and its tasks, newest first", () => {
		const { ctx, clock } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
		clock.advance(1000);
		const a = createTask(ctx, { epic: epic.id, name: "A" });
		clock.advance(1000);
		claimTask(ctx, { taskId: a.id, agent: "agent-1" });

		const events = listEvents(ctx, { epic: epic.id });
		// epic.created is in this epic; task.created + task.claimed for task A
		expect(events.map((e) => e.event_type)).toEqual([
			"task.claimed",
			"task.created",
			"epic.created",
		]);
		expect(
			events.every((e) => e.entity_id === epic.id || e.entity_id === a.id),
		).toBe(true);
	});

	test("does not leak events from other epics", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const e1 = createEpic(ctx, { project: project.id, name: "One" });
		const e2 = createEpic(ctx, { project: project.id, name: "Two" });
		createTask(ctx, { epic: e2.id, name: "Elsewhere" });

		const events = listEvents(ctx, { epic: e1.id });
		expect(events.map((e) => e.event_type)).toEqual(["epic.created"]);
	});

	test("--entity narrows to a single entity", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
		const a = createTask(ctx, { epic: epic.id, name: "A" });
		const b = createTask(ctx, { epic: epic.id, name: "B" });
		claimTask(ctx, { taskId: a.id, agent: "x" });
		submitTask(ctx, { taskId: a.id });

		const events = listEvents(ctx, { epic: epic.id, entity: a.id });
		expect(events.map((e) => e.entity_id)).toEqual([a.id, a.id, a.id]);
		void b;
	});

	test("--limit caps the returned events", () => {
		const { ctx, clock } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
		const a = createTask(ctx, { epic: epic.id, name: "A" });
		clock.advance(1);
		claimTask(ctx, { taskId: a.id, agent: "x" });

		const events = listEvents(ctx, { epic: epic.id, limit: 2 });
		expect(events).toHaveLength(2);
		expect(events[0]?.event_type).toBe("task.claimed");
	});

	test("validates the epic exists", () => {
		const { ctx } = makeTestContext();
		expectError(() => listEvents(ctx, { epic: "ghost" }), "EPIC_NOT_FOUND");
	});
});
