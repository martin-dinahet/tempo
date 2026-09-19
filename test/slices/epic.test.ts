import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic, listEpics, showEpic } from "../../src/commands/epic.ts";

describe("epic commands", () => {
	test("create persists an epic nested under a project and emits an event", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const epic = createEpic(ctx, {
			project: project.id,
			name: "Mobile",
			description: "app",
		});

		expect(epic.project_id).toBe(project.id);
		expect(epic.updated_at).toBe(epic.created_at);

		const events = ctx.events.listByEntity(epic.id);
		expect(events).toHaveLength(1);
		expect(events[0]?.event_type).toBe("epic.created");
	});

	test("create on a missing project raises PROJECT_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(
			() => createEpic(ctx, { project: "ghost", name: "X" }),
			"PROJECT_NOT_FOUND",
		);
	});

	test("list returns only the epics of the requested project", () => {
		const { ctx, clock } = makeTestContext();
		const p1 = createProject(ctx, { name: "One" });
		const p2 = createProject(ctx, { name: "Two" });
		createEpic(ctx, { project: p1.id, name: "A" });
		clock.advance(1000);
		createEpic(ctx, { project: p1.id, name: "B" });
		createEpic(ctx, { project: p2.id, name: "Other" });

		const epics = listEpics(ctx, p1.id);
		expect(epics.map((e) => e.name)).toEqual(["A", "B"]);
	});

	test("show returns the epic with derived status and an empty task list", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const epic = createEpic(ctx, { project: project.id, name: "Mobile" });

		const shown = showEpic(ctx, epic.id);
		expect(shown.id).toBe(epic.id);
		expect(shown.status).toBe("empty");
		expect(shown.tasks).toEqual([]);
		expect(shown.dependency_tree).toEqual({});
	});

	test("show on a missing epic raises EPIC_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => showEpic(ctx, "ghost"), "EPIC_NOT_FOUND");
	});
});
