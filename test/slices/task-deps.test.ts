import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	addTaskDependency,
	approveTask,
	cancelTask,
	claimTask,
	createTask,
	removeTaskDependency,
	showTask,
	submitTask,
} from "../../src/commands/task.ts";

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]) {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	const epic2 = createEpic(ctx, { project: project.id, name: "Web" });
	return { epicId: epic.id, epic2Id: epic2.id };
}

function done(ctx: ReturnType<typeof makeTestContext>["ctx"], id: string) {
	claimTask(ctx, { taskId: id, agent: "x" });
	submitTask(ctx, { taskId: id });
	approveTask(ctx, { taskId: id });
}

describe("task dependencies", () => {
	test("depend requires both tasks to exist", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		expectError(
			() => addTaskDependency(ctx, { taskId: a.id, on: "ghost" }),
			"TASK_NOT_FOUND",
		);
		expectError(
			() => addTaskDependency(ctx, { taskId: "ghost", on: a.id }),
			"TASK_NOT_FOUND",
		);
	});

	test("depend rejects across epics", () => {
		const { ctx } = makeTestContext();
		const { epicId, epic2Id } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epic2Id, name: "B" });
		expectError(
			() => addTaskDependency(ctx, { taskId: a.id, on: b.id }),
			"DEPENDENCY_NOT_SAME_EPIC",
		);
	});

	test("depend rejects self/cyclic edges", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		expectError(
			() => addTaskDependency(ctx, { taskId: a.id, on: a.id }),
			"CYCLIC_DEPENDENCY",
		);

		addTaskDependency(ctx, { taskId: a.id, on: b.id });
		expectError(
			() => addTaskDependency(ctx, { taskId: b.id, on: a.id }),
			"CYCLIC_DEPENDENCY",
		);
	});

	test("depend on an already-started task raises INVALID_TRANSITION (finish-to-start)", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		claimTask(ctx, { taskId: b.id, agent: "agent-1" });
		expectError(
			() => addTaskDependency(ctx, { taskId: b.id, on: a.id }),
			"INVALID_TRANSITION",
		);
	});

	test("a task with an incomplete dependency is computed blocked and cannot be claimed", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });

		const updated = addTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(updated.status).toBe("blocked");

		expectError(
			() => claimTask(ctx, { taskId: b.id, agent: "agent-1" }),
			"TASK_BLOCKED",
		);

		const types = ctx.events.listByEntity(b.id).map((e) => e.event_type);
		expect(types).toContain("task.blocked");
	});

	test("a task with only done dependencies stays todo", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "Done dep" });
		done(ctx, a.id);
		const b = createTask(ctx, { epic: epicId, name: "B" });

		const updated = addTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(updated.status).toBe("todo");
	});

	test("createTask supports depends-on and starts blocked when a dependency is incomplete", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B", dependsOn: [a.id] });
		expect(b.status).toBe("blocked");
		expect(ctx.dependencies.dependencyIds(b.id)).toEqual([a.id]);
	});

	test("createTask with a done dependency starts todo and emits depend_added for each dep", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		done(ctx, a.id);

		const b = createTask(ctx, { epic: epicId, name: "B", dependsOn: [a.id] });
		expect(b.status).toBe("todo");

		const types = ctx.events.listByEntity(b.id).map((e) => e.event_type);
		expect(types).toContain("task.created");
		expect(types).toContain("task.depend_added");
	});

	test("undepend removes the edge and unblocks", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		addTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(ctx.tasks.findById(b.id)?.status).toBe("blocked");

		const updated = removeTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(updated.status).toBe("todo");
		expect(ctx.dependencies.dependencyIds(b.id)).toEqual([]);

		const types = ctx.events.listByEntity(b.id).map((e) => e.event_type);
		expect(types).toContain("task.depend_removed");
		expect(types).toContain("task.unblocked");
	});

	test("undepend of a missing edge is a no-op", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		const result = removeTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(result.status).toBe("todo");
		void a;
	});

	test("approving the dependency unblocks its dependents", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		addTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(ctx.tasks.findById(b.id)?.status).toBe("blocked");

		done(ctx, a.id);

		expect(ctx.tasks.findById(b.id)?.status).toBe("todo");
		const types = ctx.events.listByEntity(b.id).map((e) => e.event_type);
		expect(types).toContain("task.unblocked");
	});

	test("cancelling the dependency keeps dependents blocked", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		addTaskDependency(ctx, { taskId: b.id, on: a.id });

		cancelTask(ctx, { taskId: a.id, reason: "dropped" });
		expect(ctx.tasks.findById(b.id)?.status).toBe("blocked");
		expect(ctx.tasks.findById(a.id)?.status).toBe("cancelled");
	});

	test("show exposes dependencies with live statuses and dependents", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		addTaskDependency(ctx, { taskId: b.id, on: a.id });

		const detailB = showTask(ctx, b.id);
		expect(detailB.dependencies.map((d) => d.name)).toEqual(["A"]);
		expect(detailB.dependencies[0]?.status).toBe("todo");
		expect(detailB.computed_status).toBe("blocked");

		const detailA = showTask(ctx, a.id);
		expect(detailA.dependents.map((d) => d.name)).toEqual(["B"]);
	});

	test("depend is idempotent: re-adding an existing edge is a no-op", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const a = createTask(ctx, { epic: epicId, name: "A" });
		const b = createTask(ctx, { epic: epicId, name: "B" });
		addTaskDependency(ctx, { taskId: b.id, on: a.id });
		addTaskDependency(ctx, { taskId: b.id, on: a.id });
		expect(ctx.dependencies.dependencyIds(b.id)).toEqual([a.id]);
	});
});
