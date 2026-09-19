import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../src/cli/main.ts";
import { resolveId } from "../src/cli/ids.ts";
import { createProject } from "../src/commands/project.ts";
import { createEpic } from "../src/commands/epic.ts";
import { expectError, makeTestContext } from "./helpers.ts";

const DB = `/tmp/opencode/cli-agent-ux-${process.pid}.db`;

function cli(args: string[]) {
	const log = console.log;
	console.log = () => {};
	try {
		return runCli([...args, "--db", DB]);
	} finally {
		console.log = log;
	}
}

function seed() {
	const project = cli(["project", "create", "--name", `P${Math.random()}`]);
	const projectId = (project.data as { id: string }).id;
	const epic = cli(["epic", "create", "--project", projectId, "--name", "E"]);
	const epicId = (epic.data as { id: string }).id;
	return { projectId, epicId };
}

afterEach(() => {
	delete process.env.TEMPO_AGENT;
});

describe("agent-facing CLI behaviour", () => {
	test("an unknown flag is an error, with a did-you-mean hint", () => {
		const { epicId } = seed();
		const result = cli(["task", "list", "--epic", epicId, "--agnt", "me"]);
		expect(result.exitCode).toBe(1);
		expect(result.error?.code).toBe("UNKNOWN_FLAG");
		expect(result.error?.hint).toContain("Did you mean --agent?");
	});

	test("a flag on a command that takes none says so", () => {
		const result = cli(["project", "list", "--nope"]);
		expect(result.error?.code).toBe("UNKNOWN_FLAG");
		expect(result.error?.hint).toContain("takes no flags");
	});

	test("a missing required flag names the field", () => {
		const result = cli(["task", "take"]);
		expect(result.error?.code).toBe("INVALID_ARGUMENT");
		expect(result.error?.message).toBe("'epic' is required");
	});

	test("errors carry a hint for the recovery step", () => {
		const { epicId } = seed();
		const task = cli(["task", "create", "--epic", epicId, "--name", "t"]);
		const id = (task.data as { id: string }).id;
		cli(["task", "claim", id, "--agent", "a"]);
		const second = cli(["task", "claim", id, "--agent", "b"]);
		expect(second.error?.code).toBe("TASK_ALREADY_CLAIMED");
		expect(second.error?.hint).toContain("tempo task take");
	});

	test("short id prefixes work anywhere an id does", () => {
		const { projectId, epicId } = seed();
		const shown = cli(["epic", "show", epicId.slice(0, 8)]);
		expect(shown.exitCode).toBe(0);
		expect((shown.data as { id: string }).id).toBe(epicId);

		const created = cli([
			"task",
			"create",
			"--epic",
			epicId.slice(0, 8),
			"--name",
			"a",
		]);
		const a = (created.data as { id: string }).id;
		const dependent = cli([
			"task",
			"create",
			"--epic",
			epicId,
			"--name",
			"b",
			"--depends-on",
			a.slice(0, 8),
		]);
		expect(dependent.exitCode).toBe(0);
		expect(cli(["project", "show", projectId.slice(0, 8)]).exitCode).toBe(0);
	});

	test("an unmatched prefix falls through to the normal not-found error", () => {
		const result = cli(["task", "show", "deadbeef"]);
		expect(result.error?.code).toBe("TASK_NOT_FOUND");
	});

	test("an ambiguous prefix lists the candidates", () => {
		const { ctx } = makeTestContext();
		const project = createProject(ctx, { name: "P" });
		const epic = createEpic(ctx, { project: project.id, name: "E" });
		const now = ctx.now();
		const ids = [
			"aaaa1111-0000-4000-8000-000000000001",
			"aaaa2222-0000-4000-8000-000000000002",
		];
		for (const id of ids) {
			ctx.tasks.create({
				id,
				epic_id: epic.id,
				name: id,
				description: null,
				status: "todo",
				assigned_agent: null,
				reviewer: null,
				created_at: now,
				updated_at: now,
			});
		}
		expectError(() => resolveId(ctx, "task", "aaaa"), "AMBIGUOUS_ID");
		expect(resolveId(ctx, "task", "aaaa1")).toBe(ids[0]!);
		// exact ids and prefixes below the minimum length are left alone
		expect(resolveId(ctx, "task", ids[1]!)).toBe(ids[1]!);
		expect(resolveId(ctx, "task", "aa")).toBe("aa");
	});

	test("TEMPO_AGENT supplies --agent for take and claim, and the audit actor", () => {
		const { epicId } = seed();
		cli(["task", "create", "--epic", epicId, "--name", "first"]);
		process.env.TEMPO_AGENT = "claude-7";
		const taken = cli(["task", "take", "--epic", epicId]);
		expect((taken.data as { assigned_agent: string }).assigned_agent).toBe(
			"claude-7",
		);

		const other = cli(["task", "create", "--epic", epicId, "--name", "x"]);
		const id = (other.data as { id: string }).id;
		const claimed = cli(["task", "claim", id]);
		expect((claimed.data as { assigned_agent: string }).assigned_agent).toBe(
			"claude-7",
		);
	});

	test("without TEMPO_AGENT or --agent, claim is still an error", () => {
		const { epicId } = seed();
		const task = cli(["task", "create", "--epic", epicId, "--name", "x"]);
		const claimed = cli(["task", "claim", (task.data as { id: string }).id]);
		expect(claimed.error?.code).toBe("INVALID_ARGUMENT");
		expect(claimed.error?.message).toBe("'agent' is required");
	});

	test("a group name lists just that group; --help scopes to one command", () => {
		const lines: string[] = [];
		const log = console.log;
		console.log = (...a) => lines.push(a.join(" "));
		try {
			const group = runCli(["task", "--db", DB]);
			expect(group.exitCode).toBe(0);
			expect(lines.join("\n")).toContain("task claim");
			expect(lines.join("\n")).not.toContain("epic create");

			lines.length = 0;
			runCli(["task", "claim", "--help", "--db", DB]);
			expect(lines.join("\n")).toBe(
				"Usage: tempo task claim <taskId> --agent <agentId>\nAssign the task to an agent and mark it in_progress",
			);
		} finally {
			console.log = log;
		}
	});

	test("findIdsByPrefix ignores non-hex input", () => {
		const { ctx } = makeTestContext();
		expect(ctx.tasks.findIdsByPrefix("%")).toEqual([]);
	});
});
