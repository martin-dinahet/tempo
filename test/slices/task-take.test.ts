import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	addTaskDependency,
	claimTask,
	createTask,
	nextTask,
	takeTask,
} from "../../src/commands/task.ts";

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]) {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { epicId: epic.id };
}

describe("task take", () => {
	test("take with no tasks returns null and leaves the epic empty", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);

		expect(takeTask(ctx, { epic: epicId })).toBeNull();
		expect(ctx.tasks.findByEpic(epicId)).toHaveLength(0);
	});

	test("take claims the oldest available task and does not give it out twice", () => {
		const { ctx, clock } = makeTestContext();
		const { epicId } = seed(ctx);
		const first = createTask(ctx, { epic: epicId, name: "First" });
		clock.advance(1000);
		const second = createTask(ctx, { epic: epicId, name: "Second" });

		const taken = takeTask(ctx, { epic: epicId, agent: "me" });
		expect(taken?.id).toBe(first.id);
		expect(taken?.status).toBe("in_progress");
		expect(taken?.assigned_agent).toBe("me");
		expect(ctx.tasks.findById(first.id)?.assigned_agent).toBe("me");

		const again = takeTask(ctx, { epic: epicId, agent: "me" });
		expect(again?.id).toBe(second.id);
		expect(again?.id).not.toBe(first.id);

		expect(takeTask(ctx, { epic: epicId, agent: "me" })).toBeNull();
	});

	test("take with --agent claims for that agent; task next --agent other skips it", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		createTask(ctx, { epic: epicId, name: "Grab" });

		const taken = takeTask(ctx, { epic: epicId, agent: "me" });
		expect(taken?.assigned_agent).toBe("me");

		expect(nextTask(ctx, { epic: epicId, agent: "other" })).toBeNull();
		expect(nextTask(ctx, { epic: epicId, agent: "me" })).toBeNull();
	});

	test("take returns null when the only task is blocked by an incomplete dep", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const dep = createTask(ctx, { epic: epicId, name: "Dep" });
		claimTask(ctx, { taskId: dep.id, agent: "someone" });
		const blocked = createTask(ctx, { epic: epicId, name: "Blocked" });
		addTaskDependency(ctx, { taskId: blocked.id, on: dep.id });

		expect(takeTask(ctx, { epic: epicId })).toBeNull();
	});

	test("take with a missing epic raises EPIC_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		expectError(() => takeTask(ctx, { epic: "ghost" }), "EPIC_NOT_FOUND");
	});

	test("take returns null when the only task is held by another agent", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Held" });
		claimTask(ctx, { taskId: task.id, agent: "other" });

		expect(takeTask(ctx, { epic: epicId })).toBeNull();
	});

	test("the claimed task's last event is task.claimed with the agent", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const task = createTask(ctx, { epic: epicId, name: "Tracked" });

		takeTask(ctx, { epic: epicId, agent: "me" });

		const ev = ctx.events.listByEntity(task.id);
		expect(ev.at(-1)?.event_type).toBe("task.claimed");
		expect(ev.at(-1)?.actor).toBe("me");
	});
});
