import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	claimTask,
	completeTask,
	createTask,
	nextTask,
} from "../../src/commands/task.ts";

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]) {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { epicId: epic.id };
}

describe("task complete", () => {
	test("completes an unclaimed, unstarted todo task as done", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Trivial" });

		const completed = completeTask(ctx, { taskId: task.id });
		expect(completed.status).toBe("done");
		expect(completed.assigned_agent).toBeNull();

		const ev = ctx.events.listByEntity(task.id).at(-1)!;
		expect(ev.event_type).toBe("task.completed");
		expect(ev.payload).toMatchObject({ from: "todo", to: "done" });
	});

	test("completing a task unblocks dependents stored blocked on it", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const dep = createTask(ctx, { epic: epicId, name: "Dep" });
		const dependent = createTask(ctx, {
			epic: epicId,
			name: "Depends",
			dependsOn: [dep.id],
		});
		expect(ctx.tasks.findById(dependent.id)?.status).toBe("blocked");

		completeTask(ctx, { taskId: dep.id });

		expect(ctx.tasks.findById(dependent.id)?.status).toBe("todo");
		const n = nextTask(ctx, { epic: epicId });
		expect(n?.id).toBe(dependent.id);
	});

	test("completing a blocked task raises INVALID_TRANSITION (deps come first)", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const dep = createTask(ctx, { epic: epicId, name: "Dep" });
		const task = createTask(ctx, {
			epic: epicId,
			name: "Blocked",
			dependsOn: [dep.id],
		});
		expect(ctx.tasks.findById(task.id)?.status).toBe("blocked");

		expectError(
			() => completeTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("completing a claimed task raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Claimed" });
		claimTask(ctx, { taskId: task.id, agent: "agent-1" });

		expectError(
			() => completeTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("completing a done task raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Already done" });
		completeTask(ctx, { taskId: task.id });

		expectError(
			() => completeTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("completing a missing task raises TASK_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => completeTask(ctx, { taskId: "ghost" }), "TASK_NOT_FOUND");
	});

	test("completing with a missing taskId raises INVALID_ARGUMENT", () => {
		const { ctx } = makeTestContext();
		expectError(() => completeTask(ctx, { taskId: "" }), "INVALID_ARGUMENT");
	});
});
