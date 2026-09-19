import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { makeTestContext, expectError } from "../helpers.ts";
import { createProject } from "../../src/commands/project.ts";
import { createEpic } from "../../src/commands/epic.ts";
import { createTask, createTasksBatch } from "../../src/commands/task.ts";

let batchCounter = 0;

function writeBatchFile(data: unknown): string {
	const path = `/tmp/opencode/task-batch-${process.pid}-${batchCounter++}.json`;
	writeFileSync(path, JSON.stringify(data));
	return path;
}

function seed(ctx: ReturnType<typeof makeTestContext>["ctx"]): {
	epicId: string;
} {
	const project = createProject(ctx, { name: "Acme" });
	const epic = createEpic(ctx, { project: project.id, name: "Mobile" });
	return { epicId: epic.id };
}

describe("task create batch", () => {
	test("creates tasks in order with intra-batch refs wired as dependencies", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = writeBatchFile({
			tasks: [
				{ ref: "a", name: "A" },
				{ ref: "b", name: "B", dependsOn: ["a"] },
				{ ref: "c", name: "C", dependsOn: ["b", "a"] },
			],
		});

		const created = createTasksBatch(ctx, { epic: epicId, file: path });

		expect(created).toHaveLength(3);
		expect(created.map((t) => t.name)).toEqual(["A", "B", "C"]);
		expect(created.map((t) => t.epic_id)).toEqual([epicId, epicId, epicId]);

		const [a, b, c] = created;
		expect(ctx.tasks.findById(b!.id)?.status).toBe("blocked");
		expect(ctx.tasks.findById(c!.id)?.status).toBe("blocked");
		expect(ctx.dependencies.dependencyIds(b!.id)).toEqual([a!.id]);
		expect(new Set(ctx.dependencies.dependencyIds(c!.id))).toEqual(
			new Set([b!.id, a!.id]),
		);
	});

	test("accepts a bare array of entries", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = writeBatchFile([
			{ ref: "x", name: "X" },
			{ ref: "y", name: "Y", dependsOn: ["x"] },
		]);

		const created = createTasksBatch(ctx, { epic: epicId, file: path });

		expect(created.map((t) => t.name)).toEqual(["X", "Y"]);
		expect(ctx.tasks.findById(created[1]!.id)?.status).toBe("blocked");
	});

	test("an unresolved intra-batch ref is INVALID_ARGUMENT and nothing persists", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = writeBatchFile({
			tasks: [
				{ ref: "x", name: "X" },
				{ ref: "y", name: "Y", dependsOn: ["missing"] },
			],
		});

		expectError(
			() => createTasksBatch(ctx, { epic: epicId, file: path }),
			"INVALID_ARGUMENT",
		);
		expect(ctx.tasks.findByEpic(epicId)).toEqual([]);
	});

	test("duplicate refs are INVALID_ARGUMENT", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = writeBatchFile({
			tasks: [
				{ ref: "dup", name: "One" },
				{ ref: "dup", name: "Two" },
			],
		});

		expectError(
			() => createTasksBatch(ctx, { epic: epicId, file: path }),
			"INVALID_ARGUMENT",
		);
	});

	test("unparseable JSON file is INVALID_ARGUMENT", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = "/tmp/opencode/task-batch-bad.json";
		writeFileSync(path, "not json");

		expectError(
			() => createTasksBatch(ctx, { epic: epicId, file: path }),
			"INVALID_ARGUMENT",
		);
	});

	test("missing epic is EPIC_NOT_FOUND", () => {
		const { ctx } = makeTestContext();
		const path = writeBatchFile({ tasks: [{ name: "Ghost" }] });

		expectError(
			() => createTasksBatch(ctx, { epic: "ghost", file: path }),
			"EPIC_NOT_FOUND",
		);
	});

	test("dependsOn may reference an existing task id in the epic", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const existing = createTask(ctx, { epic: epicId, name: "Pre" });
		const path = writeBatchFile({
			tasks: [{ name: "Post", dependsOn: [existing.id] }],
		});

		const created = createTasksBatch(ctx, { epic: epicId, file: path });

		expect(ctx.tasks.findById(created[0]!.id)?.status).toBe("blocked");
		expect(ctx.dependencies.dependencyIds(created[0]!.id)).toEqual([
			existing.id,
		]);
	});

	test("emits a task.created event for every created task", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = writeBatchFile({ tasks: [{ name: "P" }, { name: "Q" }] });

		createTasksBatch(ctx, { epic: epicId, file: path });

		const created = ctx.events
			.listByEpic(epicId)
			.filter((e) => e.event_type === "task.created");
		expect(created).toHaveLength(2);
	});

	test("empty description is stored as null", () => {
		const { ctx } = makeTestContext();
		const { epicId } = seed(ctx);
		const path = writeBatchFile({ tasks: [{ name: "D", description: "" }] });

		const created = createTasksBatch(ctx, { epic: epicId, file: path });

		expect(created[0]?.description).toBeNull();
	});
});
