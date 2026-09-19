import { describe, expect, test } from "bun:test";
import { openDb } from "../src/repositories/sqlite.ts";
import { createContext } from "../src/context.ts";
import { paint } from "../src/tui/app.ts";
import { initialAppState } from "../src/tui/state.ts";
import type { AppState } from "../src/tui/state.ts";
import { createProject } from "../src/commands/project.ts";
import { createEpic } from "../src/commands/epic.ts";
import {
	approveTask,
	claimTask,
	createTask,
	submitTask,
} from "../src/commands/task.ts";

function seedWriter(path: string): void {
	const db = openDb(path);
	const ctx = createContext(db);
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	const a = createTask(ctx, { epic: epic.id, name: "Write spec" });
	createTask(ctx, {
		epic: epic.id,
		name: "Blocked Task",
		dependsOn: [a.id],
	});
	claimTask(ctx, { taskId: a.id, agent: "agent-1" });
	submitTask(ctx, { taskId: a.id });
	approveTask(ctx, { taskId: a.id });
	db.close();
}

function frame(
	ctx: ReturnType<typeof createContext>,
	patch: Partial<AppState>,
): string {
	const state: AppState = { ...initialAppState(), ...patch };
	return paint(state, ctx, 120, 30);
}

describe("TUI (read-only viewer)", () => {
	test("selector renders seeded projects", () => {
		const path = `/tmp/opencode/tui-test-${process.pid}.db`;
		seedWriter(path);
		const db = openDb(path, { readonly: true });
		const ctx = createContext(db);

		const output = frame(ctx, {});
		db.close();

		expect(output).toContain("Acme");
		expect(output).toContain("projects");
		expect(output).toContain("Projects");
		expect(output).toContain("task tracker");
	});

	test("board renders all kanban columns with live statuses", () => {
		const path = `/tmp/opencode/tui-test-${process.pid}-2.db`;
		seedWriter(path);
		const db = openDb(path, { readonly: true });
		const ctx = createContext(db);
		const project = ctx.projects.findAll()[0]!;
		const epic = ctx.epics.findByProject(project.id)[0]!;

		const output = frame(ctx, { screen: "board", epicId: epic.id });
		db.close();

		expect(output).toContain("blocked");
		expect(output).toContain("todo");
		expect(output).toContain("in_progress");
		expect(output).toContain("in_review");
		expect(output).toContain("done");
		expect(output).toContain("cancelled");
		expect(output).toContain("Blocked Task");
		expect(output).toContain("% complete");
		expect(output).toContain("● LIVE");
	});

	test("task detail renders dependencies and history", () => {
		const path = `/tmp/opencode/tui-test-${process.pid}-3.db`;
		seedWriter(path);
		const db = openDb(path, { readonly: true });
		const ctx = createContext(db);
		const project = ctx.projects.findAll()[0]!;
		const epic = ctx.epics.findByProject(project.id)[0]!;
		const task = ctx.tasks.findByEpic(epic.id)[0]!;

		const output = frame(ctx, {
			screen: "detail",
			epicId: epic.id,
			taskId: task.id,
		});
		db.close();

		expect(output).toContain("Write spec");
		expect(output).toContain("Dependencies");
		expect(output).toContain("History");
		expect(output).toContain("approved");
	});

	test("a read-only reader can keep reading while a writer mutates (WAL)", () => {
		const path = `/tmp/opencode/tui-test-${process.pid}-4.db`;
		seedWriter(path);
		const db = openDb(path, { readonly: true });
		const ctx = createContext(db);

		const writer = openDb(path);
		const wctx = createContext(writer);
		const project = ctx.projects.findAll()[0]!;
		const epic = ctx.epics.findByProject(project.id)[0]!;
		createTask(wctx, { epic: epic.id, name: "New Task From Writer" });
		writer.close();

		const tasks = ctx.tasks.findByEpic(epic.id).map((t) => t.name);
		expect(tasks).toContain("New Task From Writer");
		db.close();
	});
});
