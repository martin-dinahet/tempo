import { describe, expect, test } from "bun:test";
import { makeTestContext } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic, showEpic } from "../../src/commands/epic.ts";
import {
	approveTask,
	cancelTask,
	claimTask,
	createTask,
	submitTask,
} from "../../src/commands/task.ts";

function seedEpic() {
	const { ctx } = makeTestContext();
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { ctx, epic };
}

function makeDone(
	ctx: ReturnType<typeof makeTestContext>["ctx"],
	taskId: string,
) {
	claimTask(ctx, { taskId, agent: "agent-1" });
	submitTask(ctx, { taskId });
	approveTask(ctx, { taskId });
}

describe("epic summary counts", () => {
	test("empty epic has all-zero summary", () => {
		const { ctx, epic } = seedEpic();
		const shown = showEpic(ctx, epic.id);
		expect(shown.summary).toEqual({
			total: 0,
			todo: 0,
			blocked: 0,
			in_progress: 0,
			in_review: 0,
			done: 0,
			cancelled: 0,
			percent_done: 0,
		});
	});

	test("mixed epic counts stored statuses and percent_done", () => {
		const { ctx, epic } = seedEpic();
		createTask(ctx, { epic: epic.id, name: "Todo task" });
		const done = createTask(ctx, { epic: epic.id, name: "Done task" });
		const cancelled = createTask(ctx, {
			epic: epic.id,
			name: "Cancelled task",
		});

		makeDone(ctx, done.id);
		cancelTask(ctx, { taskId: cancelled.id, reason: "out of scope" });

		const shown = showEpic(ctx, epic.id);
		expect(shown.summary).toEqual({
			total: 3,
			todo: 1,
			blocked: 0,
			in_progress: 0,
			in_review: 0,
			done: 1,
			cancelled: 1,
			percent_done: 33,
		});
	});

	test("all done yields 100 percent_done", () => {
		const { ctx, epic } = seedEpic();
		const d1 = createTask(ctx, { epic: epic.id, name: "A" });
		const d2 = createTask(ctx, { epic: epic.id, name: "B" });
		makeDone(ctx, d1.id);
		makeDone(ctx, d2.id);

		const shown = showEpic(ctx, epic.id);
		expect(shown.summary.total).toBe(2);
		expect(shown.summary.done).toBe(2);
		expect(shown.summary.percent_done).toBe(100);
	});
});
