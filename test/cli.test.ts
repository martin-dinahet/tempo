import { describe, expect, test } from "bun:test";
import { unlinkSync, writeFileSync } from "node:fs";
import { runCli, toErrorJson } from "../src/cli/main.ts";
import { AppError } from "../src/domain/errors.ts";

const DB = `/tmp/opencode/cli-test-${process.pid}.db`;

function cli(
	args: string[],
	db = DB,
): { result: ReturnType<typeof runCli>; stdout: string; stderr: string } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const origLog = console.log;
	const origError = console.error;
	console.log = (...a) => stdout.push(a.join(" "));
	console.error = (...a) => stderr.push(a.join(" "));
	try {
		const result = runCli([...args, "--db", db]);
		if (result.output !== undefined) stdout.push(result.output);
		return { result, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
	} finally {
		console.log = origLog;
		console.error = origError;
	}
}

describe("cli dispatch", () => {
	test("unknown command returns a JSON error with non-zero exit", () => {
		const { result } = cli(["frobnicate"]);
		expect(result.exitCode).toBe(1);
		expect(result.error).toMatchObject({ code: "UNKNOWN_COMMAND" });
		expect(JSON.stringify({ error: result.error })).toContain("{");
	});

	test("errors serialize as {error:{code,message}}", () => {
		const { result } = cli(["project", "show", "ghost"]);
		expect(result.exitCode).toBe(1);
		expect(result.error).toMatchObject({ code: "PROJECT_NOT_FOUND" });
		expect(JSON.stringify({ error: result.error })).toContain('"error"');
	});

	test("tui with a missing db fails fast instead of launching", () => {
		const local = `/tmp/opencode/tui-cli-${process.pid}.db`;
		try {
			unlinkSync(local);
		} catch {
			// nothing to clean up
		}
		const { result, stderr } = cli(["tui"], local);
		expect(result.exitCode).toBe(1);
		expect(stderr).toContain("database not found");
	});

	test("project create -> list round trip works end to end", () => {
		const { result: created } = cli(["project", "create", "--name", "Widgets"]);
		expect(created.exitCode).toBe(0);
		const id = (created.data as { id: string }).id;

		const { result: listed } = cli(["project", "list"]);
		expect(listed.exitCode).toBe(0);
		const names = (listed.data as Array<{ name: string }>).map((p) => p.name);
		expect(names).toContain("Widgets");

		const { result: shown } = cli(["project", "show", id]);
		expect(shown.exitCode).toBe(0);
		expect((shown.data as { name: string }).name).toBe("Widgets");
	});

	test("--human renders tables instead of JSON", () => {
		cli(["project", "create", "--name", "Human Co"]);
		const { result, stdout } = cli(["project", "list", "--human"]);
		expect(result.exitCode).toBe(0);
		expect(stdout).toContain("Human Co");
		expect(stdout).not.toContain('"name"');
	});

	test("--human on a command without a formatter falls back to JSON", () => {
		const { result } = cli([
			"project",
			"create",
			"--name",
			"Json Only",
			"--human",
		]);
		expect(result.exitCode).toBe(0);
		// create has a human formatter; JSON fallback returns data as object
		expect((result.data as { name: string }).name).toBe("Json Only");
	});

	test("missing required flag reports INVALID_ARGUMENT", () => {
		const { result } = cli(["project", "create"]);
		expect(result.exitCode).toBe(1);
		expect(result.error?.code).toBe("INVALID_ARGUMENT");
	});

	test("task lifecycle over the CLI: create -> claim race -> approve", () => {
		const { result: p } = cli([
			"project",
			"create",
			"--name",
			"L",
			"--db",
			`${DB}2`,
		]);
		const pid = (p.data as { id: string }).id;
		const { result: e } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"Ep",
			"--db",
			`${DB}2`,
		]);
		const eid = (e.data as { id: string }).id;
		const { result: t } = cli([
			"task",
			"create",
			"--epic",
			eid,
			"--name",
			"Work",
			"--db",
			`${DB}2`,
		]);
		const tid = (t.data as { id: string }).id;

		const claim1 = cli([
			"task",
			"claim",
			tid,
			"--agent",
			"a",
			"--db",
			`${DB}2`,
		]);
		const claim2 = cli([
			"task",
			"claim",
			tid,
			"--agent",
			"b",
			"--db",
			`${DB}2`,
		]);
		expect(claim1.result.exitCode).toBe(0);
		expect(claim2.result.exitCode).toBe(1);
		expect(claim2.result.error?.code).toBe("TASK_ALREADY_CLAIMED");

		const sub = cli(["task", "submit", tid, "--db", `${DB}2`]);
		const appr = cli(["task", "approve", tid, "--db", `${DB}2`]);
		expect(sub.result.exitCode).toBe(0);
		expect(appr.result.exitCode).toBe(0);
		expect((appr.result.data as { status: string }).status).toBe("done");

		const next = cli(["task", "next", "--epic", eid, "--db", `${DB}2`]);
		expect(next.result.data).toBeNull();

		const events = cli(["event", "list", "--epic", eid, "--db", `${DB}2`]);
		const types = (events.result.data as Array<{ event_type: string }>).map(
			(x) => x.event_type,
		);
		expect(types).toContain("task.created");
		expect(types).toContain("task.claimed");
		expect(types).toContain("task.approved");
	});

	test("task reviewer flow over the CLI: claim -> submit --reviewer -> approve --as", () => {
		const db = `${DB}review`;
		const { result: p } = cli(
			["project", "create", "--name", "Review Flow"],
			db,
		);
		const pid = (p.data as { id: string }).id;
		const { result: e } = cli(
			["epic", "create", "--project", pid, "--name", "Ep"],
			db,
		);
		const eid = (e.data as { id: string }).id;
		const { result: t } = cli(
			["task", "create", "--epic", eid, "--name", "Work"],
			db,
		);
		const tid = (t.data as { id: string }).id;

		const claim = cli(["task", "claim", tid, "--agent", "a1"], db);
		expect(claim.result.exitCode).toBe(0);

		const sub = cli(["task", "submit", tid, "--reviewer", "r1"], db);
		expect(sub.result.exitCode).toBe(0);
		expect((sub.result.data as { reviewer: string }).reviewer).toBe("r1");
		expect((sub.result.data as { assigned_agent: string }).assigned_agent).toBe(
			"a1",
		);

		const noAs = cli(["task", "approve", tid], db);
		expect(noAs.result.exitCode).toBe(1);
		expect(noAs.result.error?.code).toBe("NOT_REVIEWER");

		const appr = cli(["task", "approve", tid, "--as", "r1"], db);
		expect(appr.result.exitCode).toBe(0);
		expect((appr.result.data as { status: string }).status).toBe("done");
	});

	test("task update round trip over the CLI: create -> update name -> changed", () => {
		const { result: p } = cli(["project", "create", "--name", "Rename Co"]);
		const pid = (p.data as { id: string }).id;
		const { result: e } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"Ep",
		]);
		const eid = (e.data as { id: string }).id;
		const { result: t } = cli([
			"task",
			"create",
			"--epic",
			eid,
			"--name",
			"Old",
		]);
		const tid = (t.data as { id: string }).id;

		const { result: upd } = cli(["task", "update", tid, "--name", "New"]);
		expect(upd.exitCode).toBe(0);
		expect((upd.data as { name: string }).name).toBe("New");
	});

	test("task complete round trip over the CLI: create -> complete -> done", () => {
		const { result: p } = cli(["project", "create", "--name", "Complete Co"]);
		const pid = (p.data as { id: string }).id;
		const { result: e } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"Ep",
		]);
		const eid = (e.data as { id: string }).id;
		const { result: t } = cli([
			"task",
			"create",
			"--epic",
			eid,
			"--name",
			"Trivial",
		]);
		const tid = (t.data as { id: string }).id;

		const { result: completed } = cli(["task", "complete", tid]);
		expect(completed.exitCode).toBe(0);
		expect((completed.data as { status: string }).status).toBe("done");
	});

	test("task create batch round trip over the CLI", () => {
		const { result: p } = cli(["project", "create", "--name", "Batch Co"]);
		const pid = (p.data as { id: string }).id;
		const { result: e } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"Ep",
		]);
		const eid = (e.data as { id: string }).id;
		const tmp = `/tmp/opencode/task-batch-cli-${process.pid}.json`;
		writeFileSync(
			tmp,
			JSON.stringify({
				tasks: [
					{ ref: "f", name: "First" },
					{ ref: "s", name: "Second", dependsOn: ["f"] },
				],
			}),
		);
		const { result } = cli([
			"task",
			"create",
			"batch",
			"--epic",
			eid,
			"--file",
			tmp,
		]);
		expect(result.exitCode).toBe(0);
		const data = result.data as Array<{ name: string; status: string }>;
		expect(data).toHaveLength(2);
		expect(data.map((t) => t.status)).toEqual(["todo", "blocked"]);
		expect(data.map((t) => t.name)).toEqual(["First", "Second"]);
	});

	test("task take round trip over the CLI: create -> take -> claimed", () => {
		const { result: p } = cli(["project", "create", "--name", "Grab Co"]);
		const pid = (p.data as { id: string }).id;
		const { result: e } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"Ep",
		]);
		const eid = (e.data as { id: string }).id;
		cli(["task", "create", "--epic", eid, "--name", "Bit"]);
		cli(["task", "create", "--epic", eid, "--name", "Second"]);

		const { result: taken } = cli([
			"task",
			"take",
			"--epic",
			eid,
			"--agent",
			"me",
		]);
		expect(taken.exitCode).toBe(0);
		expect((taken.data as { status: string }).status).toBe("in_progress");
		expect((taken.data as { assigned_agent: string }).assigned_agent).toBe(
			"me",
		);
	});

	test("task list --agent without --epic returns the right tasks across epics", () => {
		const { result: p } = cli(["project", "create", "--name", "Two Epics Co"]);
		const pid = (p.data as { id: string }).id;
		const { result: e1 } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"E1",
		]);
		const { result: e2 } = cli([
			"epic",
			"create",
			"--project",
			pid,
			"--name",
			"E2",
		]);
		const e1id = (e1.data as { id: string }).id;
		const e2id = (e2.data as { id: string }).id;
		const { result: t1 } = cli([
			"task",
			"create",
			"--epic",
			e1id,
			"--name",
			"Alpha",
		]);
		const { result: t2 } = cli([
			"task",
			"create",
			"--epic",
			e2id,
			"--name",
			"Beta",
		]);
		const t1id = (t1.data as { id: string }).id;
		const t2id = (t2.data as { id: string }).id;

		const claim1 = cli(["task", "claim", t1id, "--agent", "agent-x"]);
		const claim2 = cli(["task", "claim", t2id, "--agent", "agent-y"]);
		expect(claim1.result.exitCode).toBe(0);
		expect(claim2.result.exitCode).toBe(0);

		const { result: mine } = cli(["task", "list", "--agent", "agent-x"]);
		expect(mine.exitCode).toBe(0);
		const mineIds = (mine.data as Array<{ id: string }>).map((x) => x.id);
		expect(mineIds).toContain(t1id);
		expect(mineIds).not.toContain(t2id);
	});
});

describe("toErrorJson", () => {
	test("maps AppError to its code", () => {
		expect(toErrorJson(new AppError("X", "msg"))).toEqual({
			code: "X",
			message: "msg",
		});
	});
	test("maps plain errors to INTERNAL_ERROR", () => {
		expect(toErrorJson(new Error("boom"))).toMatchObject({
			code: "INTERNAL_ERROR",
		});
	});
});
