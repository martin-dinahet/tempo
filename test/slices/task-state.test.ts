import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	approveTask,
	cancelTask,
	claimTask,
	createTask,
	rejectTask,
	releaseTask,
	submitTask,
} from "../../src/commands/task.ts";

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]) {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { projectId: project.id, epicId: epic.id };
}

function claim(
	ctx: ReturnType<typeof makeTestContext>["ctx"],
	id: string,
	agent = "agent-1",
) {
	return claimTask(ctx, { taskId: id, agent });
}

describe("task state transitions", () => {
	test("claim assigns and starts a todo task, emitting task.claimed with actor = agent", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });

		const claimed = claim(ctx, task.id, "agent-7");
		expect(claimed.status).toBe("in_progress");
		expect(claimed.assigned_agent).toBe("agent-7");

		const ev = ctx.events.listByEntity(task.id);
		expect(ev[1]?.event_type).toBe("task.claimed");
		expect(ev[1]?.actor).toBe("agent-7");
		expect(ev[1]?.payload).toMatchObject({ agent: "agent-7" });
	});

	test("claiming an already claimed task fails with TASK_ALREADY_CLAIMED", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "agent-1");
		expectError(() => claim(ctx, task.id, "agent-2"), "TASK_ALREADY_CLAIMED");
		// original assignee is not overwritten
		expect(ctx.tasks.findById(task.id)?.assigned_agent).toBe("agent-1");
	});

	test("claiming a missing task raises TASK_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => claim(ctx, "ghost"), "TASK_NOT_FOUND");
	});

	test("claiming a done task raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		submitTask(ctx, { taskId: task.id });
		approveTask(ctx, { taskId: task.id });
		expectError(() => claim(ctx, task.id), "INVALID_TRANSITION");
	});

	test("release unassigns and returns an in_progress task to its computed status", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id, "agent-1");

		const released = releaseTask(ctx, { taskId: task.id });
		expect(released.status).toBe("todo");
		expect(released.assigned_agent).toBeNull();

		const ev = ctx.events.listByEntity(task.id);
		const last = ev[ev.length - 1]!;
		expect(last.event_type).toBe("task.released");
		expect(last.payload).toMatchObject({ agent: "agent-1", to: "todo" });
	});

	test("releasing a task that was never claimed raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		expectError(
			() => releaseTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("submit moves in_progress to in_review", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		const submitted = submitTask(ctx, { taskId: task.id });
		expect(submitted.status).toBe("in_review");
		expect(ctx.events.listByEntity(task.id).at(-1)?.event_type).toBe(
			"task.submitted",
		);
	});

	test("submit without claiming raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		expectError(
			() => submitTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("approve completes a task in review", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		submitTask(ctx, { taskId: task.id });
		const approved = approveTask(ctx, { taskId: task.id });
		expect(approved.status).toBe("done");
		expect(ctx.events.listByEntity(task.id).at(-1)?.event_type).toBe(
			"task.approved",
		);
	});

	test("approve from in_progress raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		expectError(
			() => approveTask(ctx, { taskId: task.id }),
			"INVALID_TRANSITION",
		);
	});

	test("reject sends work back to in_progress and records the reason", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		submitTask(ctx, { taskId: task.id });

		const rejected = rejectTask(ctx, { taskId: task.id, reason: "nope" });
		expect(rejected.status).toBe("in_progress");

		const ev = ctx.events.listByEntity(task.id).at(-1)!;
		expect(ev.event_type).toBe("task.rejected");
		expect(ev.payload).toMatchObject({ reason: "nope" });
	});

	test("reject without a reason raises INVALID_ARGUMENT", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		submitTask(ctx, { taskId: task.id });
		expectError(
			() => rejectTask(ctx, { taskId: task.id, reason: "" }),
			"INVALID_ARGUMENT",
		);
	});

	test("cancel works from any non-terminal state and requires a reason", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const t1 = createTask(ctx, { epic: epicId, name: "never started" });
		const t2 = createTask(ctx, { epic: epicId, name: "in progress" });
		claim(ctx, t2.id);
		const t3 = createTask(ctx, { epic: epicId, name: "in review" });
		claim(ctx, t3.id);
		submitTask(ctx, { taskId: t3.id });

		expect(cancelTask(ctx, { taskId: t1.id, reason: "n/a" }).status).toBe(
			"cancelled",
		);
		expect(cancelTask(ctx, { taskId: t2.id, reason: "n/a" }).status).toBe(
			"cancelled",
		);
		expect(cancelTask(ctx, { taskId: t3.id, reason: "n/a" }).status).toBe(
			"cancelled",
		);

		expect(ctx.tasks.findById(t2.id)?.assigned_agent).toBeNull();
		expect(ctx.events.listByEntity(t2.id).at(-1)?.payload).toMatchObject({
			reason: "n/a",
		});
	});

	test("cancelling a terminal task raises INVALID_TRANSITION", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		claim(ctx, task.id);
		submitTask(ctx, { taskId: task.id });
		approveTask(ctx, { taskId: task.id });
		expectError(
			() => cancelTask(ctx, { taskId: task.id, reason: "oops" }),
			"INVALID_TRANSITION",
		);
	});

	test("cancel requires a reason", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "A" });
		expectError(
			() => cancelTask(ctx, { taskId: task.id, reason: "" }),
			"INVALID_ARGUMENT",
		);
	});
});
