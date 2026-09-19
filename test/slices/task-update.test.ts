import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	approveTask,
	claimTask,
	createTask,
	submitTask,
	updateTask,
} from "../../src/commands/task.ts";

function seedEpic(ctx: ReturnType<typeof makeTestContext>["ctx"]): {
	projectId: string;
	epicId: string;
} {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { projectId: project.id, epicId: epic.id };
}

describe("task update", () => {
	test("update name renames the task, bumps updated_at and emits task.updated", () => {
		const { ctx, clock } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Old" });
		clock.advance(1000);

		const updated = updateTask(ctx, { taskId: task.id, name: "New" });
		expect(updated.name).toBe("New");
		expect(updated.updated_at > task.created_at).toBe(true);

		const ev = ctx.events.listByEntity(task.id).at(-1)!;
		expect(ev.event_type).toBe("task.updated");
		expect(ev.payload).toEqual({ name: "New" });
	});

	test("update sets a description and empty string clears it to null", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });

		const withDesc = updateTask(ctx, { taskId: task.id, description: "v1" });
		expect(withDesc.description).toBe("v1");
		expect(ctx.events.listByEntity(task.id).at(-1)?.payload).toEqual({
			description: "v1",
		});

		const cleared = updateTask(ctx, { taskId: task.id, description: "" });
		expect(cleared.description).toBeNull();
		expect(ctx.events.listByEntity(task.id).at(-1)?.payload).toEqual({
			description: null,
		});
	});

	test("update with neither name nor description raises INVALID_ARGUMENT", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		expectError(() => updateTask(ctx, { taskId: task.id }), "INVALID_ARGUMENT");
	});

	test("update of a missing task raises TASK_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(
			() => updateTask(ctx, { taskId: "ghost", name: "New" }),
			"TASK_NOT_FOUND",
		);
	});

	test("update of a done task raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claimTask(ctx, { taskId: task.id, agent: "agent-1" });
		submitTask(ctx, { taskId: task.id });
		approveTask(ctx, { taskId: task.id });
		expectError(
			() => updateTask(ctx, { taskId: task.id, name: "New" }),
			"INVALID_TRANSITION",
		);
	});

	test("updating only the name leaves the description untouched", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seedEpic(ctx);
		const task = createTask(ctx, {
			epic: epicId,
			name: "A",
			description: "keep me",
		});

		const updated = updateTask(ctx, { taskId: task.id, name: "B" });
		expect(updated.name).toBe("B");
		expect(updated.description).toBe("keep me");
	});
});
