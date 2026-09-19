import { describe, expect, test } from "bun:test";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import {
	approveTask,
	cancelTask,
	claimTask,
	createTask,
	nextTask,
	submitTask,
} from "../../src/commands/task.ts";

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]) {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { epicId: epic.id };
}

describe("task next", () => {
	test("returns the oldest unblocked, unassigned todo task", () => {
		const { ctx, clock } = makeTestContext();
		const { epicId } = seed(ctx);
		const first = createTask(ctx, { epic: epicId, name: "First" });
		clock.advance(1000);
		createTask(ctx, { epic: epicId, name: "Second" });

		const n = nextTask(ctx, { epic: epicId });
		expect(n?.id).toBe(first.id);
	});

	test("skips blocked, in_progress, done and cancelled tasks", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const dep = createTask(ctx, { epic: epicId, name: "Dep" });
		claimTask(ctx, { taskId: dep.id, agent: "someone" }); // held, in_progress
		const blocked = createTask(ctx, {
			epic: epicId,
			name: "Blocked",
			dependsOn: [dep.id],
		});
		const finishing = createTask(ctx, { epic: epicId, name: "In progress" });
		const done = createTask(ctx, { epic: epicId, name: "Done" });
		const cancelled = createTask(ctx, { epic: epicId, name: "Cancelled" });
		const available = createTask(ctx, { epic: epicId, name: "Available" });

		claimTask(ctx, { taskId: finishing.id, agent: "x" });
		submitTask(ctx, { taskId: finishing.id });
		approveTask(ctx, { taskId: finishing.id });
		claimTask(ctx, { taskId: done.id, agent: "x" });
		submitTask(ctx, { taskId: done.id });
		approveTask(ctx, { taskId: done.id });
		cancelTask(ctx, { taskId: cancelled.id, reason: "n/a" });

		void blocked;
		const n = nextTask(ctx, { epic: epicId });
		expect(n?.id).toBe(available.id);
	});

	test("never returns a task already assigned to another agent, even with --agent", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const taken = createTask(ctx, { epic: epicId, name: "Taken" });
		claimTask(ctx, { taskId: taken.id, agent: "other" });
		const mine = createTask(ctx, { epic: epicId, name: "Mine" });

		const n = nextTask(ctx, { epic: epicId, agent: "me" });
		expect(n?.id).toBe(mine.id);
	});

	test("returns null when no todo work is available (not an error)", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		expect(nextTask(ctx, { epic: epicId })).toBeNull();

		const task = createTask(ctx, { epic: epicId, name: "Solo" });
		claimTask(ctx, { taskId: task.id, agent: "x" });
		expect(nextTask(ctx, { epic: epicId })).toBeNull();
	});

	test("validates the epic exists", () => {
		const { ctx } = makeTestContext();
		expectError(() => nextTask(ctx, { epic: "ghost" }), "EPIC_NOT_FOUND");
	});
});
