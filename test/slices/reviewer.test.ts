import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	approveTask,
	claimTask,
	createTask,
	rejectTask,
	submitTask,
} from "../../src/commands/task.ts";

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]) {
	const project = createProject(ctx, { name: "Reviewer Co" });
	const epic = createEpic(ctx, { project: project.id, name: "Epic" });
	return { projectId: project.id, epicId: epic.id };
}

function claim(
	ctx: ReturnType<typeof makeTestContext>["ctx"],
	id: string,
	agent = "a1",
) {
	return claimTask(ctx, { taskId: id, agent });
}

describe("reviewer model", () => {
	test("submit with no reviewer keeps the assignee and clears the reviewer", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");

		const submitted = submitTask(ctx, { taskId: task.id });
		expect(submitted.status).toBe("in_review");
		expect(submitted.assigned_agent).toBe("a1");
		expect(submitted.reviewer).toBeNull();

		const ev = ctx.events.listByEntity(task.id).at(-1)!;
		expect(ev.event_type).toBe("task.submitted");
		expect(ev.payload).toMatchObject({
			from: "in_progress",
			to: "in_review",
			reviewer: null,
		});
	});

	test("submit with a reviewer records it while keeping the assignee", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");

		const submitted = submitTask(ctx, { taskId: task.id, reviewer: "r1" });
		expect(submitted.status).toBe("in_review");
		expect(submitted.assigned_agent).toBe("a1");
		expect(submitted.reviewer).toBe("r1");
		expect(ctx.events.listByEntity(task.id).at(-1)?.payload).toMatchObject({
			reviewer: "r1",
		});
	});

	test("submit with reviewer equal to assignee raises SELF_REVIEW", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");

		expectError(
			() => submitTask(ctx, { taskId: task.id, reviewer: "a1" }),
			"SELF_REVIEW",
		);
	});

	test("submit on a task that is not in_progress raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });

		expectError(
			() => submitTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("approve as the designated reviewer completes the task", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");
		submitTask(ctx, { taskId: task.id, reviewer: "r1" });

		const approved = approveTask(ctx, { taskId: task.id, as: "r1" });
		expect(approved.status).toBe("done");
		expect(approved.reviewer).toBeNull();

		const ev = ctx.events.listByEntity(task.id).at(-1)!;
		expect(ev.event_type).toBe("task.approved");
		expect(ev.actor).toBe("r1");
		expect(ev.payload).toMatchObject({ to: "done", by: "r1" });
	});

	test("approve without --as when a reviewer is set raises NOT_REVIEWER", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");
		submitTask(ctx, { taskId: task.id, reviewer: "r1" });

		expectError(() => approveTask(ctx, { taskId: task.id }), "NOT_REVIEWER");
	});

	test("approve with the wrong --as raises NOT_REVIEWER", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");
		submitTask(ctx, { taskId: task.id, reviewer: "r1" });

		expectError(
			() => approveTask(ctx, { taskId: task.id, as: "other" }),
			"NOT_REVIEWER",
		);
	});

	test("approve a legacy task without a reviewer still works without --as", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");
		submitTask(ctx, { taskId: task.id });

		const approved = approveTask(ctx, { taskId: task.id });
		expect(approved.status).toBe("done");
	});

	test("reject as the correct reviewer returns to in_progress keeping the assignee", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");
		submitTask(ctx, { taskId: task.id, reviewer: "r1" });

		const rejected = rejectTask(ctx, {
			taskId: task.id,
			as: "r1",
			reason: "redo",
		});
		expect(rejected.status).toBe("in_progress");
		expect(rejected.reviewer).toBeNull();
		expect(rejected.assigned_agent).toBe("a1");

		const ev = ctx.events.listByEntity(task.id).at(-1)!;
		expect(ev.event_type).toBe("task.rejected");
		expect(ev.actor).toBe("r1");
		expect(ev.payload).toMatchObject({ reason: "redo", by: "r1" });
	});

	test("reject with the wrong --as raises NOT_REVIEWER", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "a1");
		submitTask(ctx, { taskId: task.id, reviewer: "r1" });

		expectError(
			() => rejectTask(ctx, { taskId: task.id, as: "wrong", reason: "x" }),
			"NOT_REVIEWER",
		);
	});

	test("approve a missing task raises TASK_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => approveTask(ctx, { taskId: "ghost" }), "TASK_NOT_FOUND");
	});
});
