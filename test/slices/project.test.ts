import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import {
	createProject,
	listProjects,
	showProject,
} from "../../src/commands/project.ts";

describe("project commands", () => {
	test("create persists a project and records a project.created event", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, {
			name: "Acme",
			description: "widgets",
		});
		expect(project.id).toBeTruthy();
		expect(project.name).toBe("Acme");

		const persisted = ctx.projects.findById(project.id);
		expect(persisted?.description).toBe("widgets");

		const events = ctx.events.listByEntity(project.id);
		expect(events).toHaveLength(1);
		expect(events[0]?.event_type).toBe("project.created");
		expect(events[0]?.actor).toBe("human");
	});

	test("create rejects duplicate names", () => {
		const { ctx } = makeTestContext();
		createProject(ctx, { name: "Acme" });
		expectError(
			() => createProject(ctx, { name: "Acme" }),
			"PROJECT_NAME_TAKEN",
		);
		expectError(
			() => createProject(ctx, { name: "Acme" }),
			"PROJECT_NAME_TAKEN",
		);
	});

	test("create requires a name (validated at the boundary)", () => {
		const { ctx } = makeTestContext();
		expectError(() => createProject(ctx, { name: "" }), "INVALID_ARGUMENT");
		expectError(() => createProject(ctx, {}), "INVALID_ARGUMENT");
	});

	test("list returns all projects, oldest first", () => {
		const { ctx, clock } = makeTestContext();
		createProject(ctx, { name: "A" });
		clock.advance(1000);
		createProject(ctx, { name: "B" });

		const all = listProjects(ctx);
		expect(all.map((p) => p.name)).toEqual(["A", "B"]);
	});

	test("same-millisecond creates keep deterministic insertion order", () => {
		const { ctx } = makeTestContext();
		createProject(ctx, { name: "A" });
		createProject(ctx, { name: "B" });
		createProject(ctx, { name: "C" });

		const all = listProjects(ctx);
		expect(all.map((p) => p.name)).toEqual(["A", "B", "C"]);
	});

	test("show returns a single project with its epics", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, { name: "Acme" });
		const shown = showProject(ctx, project.id);
		expect(shown.id).toBe(project.id);
		expect(shown.epics).toEqual([]);
	});

	test("show on a missing project raises PROJECT_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => showProject(ctx, "nope"), "PROJECT_NOT_FOUND");
	});
});
