import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import { createTask, listTasks, showTask } from "../../src/commands/task.ts";

function seedEpic(ctx: ReturnType<typeof makeTestContext>["ctx"]): {
	projectId: string;
	epicId: string;
} {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { projectId: project.id, epicId: epic.id };
}

describe("task commands (basic CRUD)", () => {
	test("create persists a task in an epic with status todo and emits an event", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, {
			epic: epicId,
			name: "Write spec",
			description: "v1",
		});

		expect(task.epic_id).toBe(epicId);
		expect(task.status).toBe("todo");
		expect(task.assigned_agent).toBeNull();

		const events = ctx.events.listByEntity(task.id);
		expect(events).toHaveLength(1);
		expect(events[0]?.event_type).toBe("task.created");
	});

	test("create on a missing epic raises EPIC_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(
			() => createTask(ctx, { epic: "ghost", name: "X" }),
			"EPIC_NOT_FOUND",
		);
	});

	test("create requires a name", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		expectError(
			() => createTask(ctx, { epic: epicId, name: "" }),
			"INVALID_ARGUMENT",
		);
	});

	test("list returns all tasks of an epic, oldest first", () => {
		const { ctx, clock } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		createTask(ctx, { epic: epicId, name: "A" });
		clock.advance(1000);
		createTask(ctx, { epic: epicId, name: "B" });

		const tasks = listTasks(ctx, { epic: epicId });
		expect(tasks.map((t) => t.name)).toEqual(["A", "B"]);
	});

	test("list --status filters by stored status", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		createTask(ctx, { epic: epicId, name: "A" });
		const t = createTask(ctx, { epic: epicId, name: "B" });
		ctx.tasks.updateStatus(t.id, "in_progress", ctx.now());

		const todo = listTasks(ctx, { epic: epicId, status: "todo" });
		const inProgress = listTasks(ctx, { epic: epicId, status: "in_progress" });
		expect(todo.map((x) => x.name)).toEqual(["A"]);
		expect(inProgress.map((x) => x.name)).toEqual(["B"]);
	});

	test("list --agent filters by assignee", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		ctx.tasks.updateStatusAndAssignee(
			b.id,
			"in_progress",
			"agent-1",
			ctx.now(),
		);

		const mine = listTasks(ctx, { epic: epicId, agent: "agent-1" });
		expect(mine.map((x) => x.name)).toEqual(["B"]);
	});

	test("list --unassigned filters to tasks with no assignee", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		ctx.tasks.updateStatusAndAssignee(
			b.id,
			"in_progress",
			"agent-1",
			ctx.now(),
		);

		const unassigned = listTasks(ctx, { epic: epicId, unassigned: true });
		expect(unassigned.map((x) => x.id)).toEqual([a.id]);
	});

	test("list with no epic --agent filters by assignee across epics", () => {
		const { ctx } = makeTestContext();
		const p = createProject(ctx, { name: "Acme-two" });
		const ep1 = createEpic(ctx, { project: p.id, name: "Mobile" });
		const ep2 = createEpic(ctx, { project: p.id, name: "Web" });
		createTask(ctx, { epic: ep1.id, name: "Mobile A" });
		const b1 = createTask(ctx, { epic: ep1.id, name: "Mobile B" });
		const b2 = createTask(ctx, { epic: ep2.id, name: "Web B" });
		ctx.tasks.updateStatusAndAssignee(
			b1.id,
			"in_progress",
			"agent-1",
			ctx.now(),
		);
		ctx.tasks.updateStatusAndAssignee(
			b2.id,
			"in_progress",
			"agent-2",
			ctx.now(),
		);

		const mine = listTasks(ctx, { agent: "agent-1" });
		expect(mine.map((x) => x.id)).toEqual([b1.id]);
		const theirs = listTasks(ctx, { agent: "agent-2" });
		expect(theirs.map((x) => x.id)).toEqual([b2.id]);
	});

	test("list with no epic --unassigned filters across epics", () => {
		const { ctx } = makeTestContext();
		const p = createProject(ctx, { name: "Acme-three" });
		const ep1 = createEpic(ctx, { project: p.id, name: "Mobile" });
		const ep2 = createEpic(ctx, { project: p.id, name: "Web" });
		const a1 = createTask(ctx, { epic: ep1.id, name: "A1" });
		const a2 = createTask(ctx, { epic: ep2.id, name: "A2" });
		const b = createTask(ctx, { epic: ep1.id, name: "B" });
		ctx.tasks.updateStatusAndAssignee(
			b.id,
			"in_progress",
			"agent-1",
			ctx.now(),
		);

		const unassigned = listTasks(ctx, { unassigned: true });
		expect(unassigned.map((x) => x.id).sort()).toEqual([a1.id, a2.id].sort());
	});

	test("list with no epic and no filters returns all tasks oldest first", () => {
		const { ctx, clock } = makeTestContext();
		const p = createProject(ctx, { name: "Acme-four" });
		const ep1 = createEpic(ctx, { project: p.id, name: "Mobile" });
		const ep2 = createEpic(ctx, { project: p.id, name: "Web" });
		createTask(ctx, { epic: ep1.id, name: "A" });
		clock.advance(1000);
		createTask(ctx, { epic: ep2.id, name: "B" });

		const tasks = listTasks(ctx, {});
		expect(tasks.map((t) => t.name)).toEqual(["A", "B"]);
	});

	test("list with no epic --status filters across epics", () => {
		const { ctx } = makeTestContext();
		const p = createProject(ctx, { name: "Acme-five" });
		const ep1 = createEpic(ctx, { project: p.id, name: "Mobile" });
		const ep2 = createEpic(ctx, { project: p.id, name: "Web" });
		const a = createTask(ctx, { epic: ep1.id, name: "A" });
		const b = createTask(ctx, { epic: ep2.id, name: "B" });
		ctx.tasks.updateStatus(a.id, "in_progress", ctx.now());
		ctx.tasks.updateStatus(b.id, "in_progress", ctx.now());

		const inProgress = listTasks(ctx, { status: "in_progress" });
		expect(inProgress.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
		const todo = listTasks(ctx, { status: "todo" });
		expect(todo).toEqual([]);
	});

	test("list without an epic still validates a provided epic", () => {
		const { ctx } = makeTestContext();
		expectError(() => listTasks(ctx, { epic: "ghost" }), "EPIC_NOT_FOUND");
	});

	test("show returns the task with empty deps, dependents and event history", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Write spec" });

		const detail = showTask(ctx, task.id);
		expect(detail.task.name).toBe("Write spec");
		expect(detail.computed_status).toBe("todo");
		expect(detail.dependencies).toEqual([]);
		expect(detail.dependents).toEqual([]);
		expect(detail.events.length).toBe(1);
	});

	test("show on a missing task raises TASK_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => showTask(ctx, "ghost"), "TASK_NOT_FOUND");
	});
});
