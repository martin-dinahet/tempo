import { existsSync, rmSync } from "node:fs";
import { openDb } from "../src/repositories/sqlite.ts";
import { createContext } from "../src/context.ts";
import { paint } from "../src/tui/app.ts";
import { initialAppState } from "../src/tui/state.ts";
import type { AppState } from "../src/tui/state.ts";
import { createProject } from "../src/commands/project.ts";
import { createEpic } from "../src/commands/epic.ts";
import {
	approveTask,
	claimTask,
	createTask,
	submitTask,
} from "../src/commands/task.ts";

const width = Number(process.env.PREV_W ?? 120);
const height = Number(process.env.PREV_H ?? 30);

if (existsSync("/tmp/opencode/preview.db")) {
	rmSync("/tmp/opencode/preview.db");
}
if (existsSync("/tmp/opencode/preview.db-shm"))
	rmSync("/tmp/opencode/preview.db-shm");
if (existsSync("/tmp/opencode/preview.db-wal"))
	rmSync("/tmp/opencode/preview.db-wal");
const seedCtx = createContext(openDb("/tmp/opencode/preview.db"));
const seedProject = createProject(seedCtx, {
	name: "Acme",
	description: "Mobile app platform — widgets, auth and analytics",
});
const seedProject2 = createProject(seedCtx, {
	name: "Globex",
	description: "Back office — billing, ledger and reporting",
});
const seedEpic = createEpic(seedCtx, {
	project: seedProject.id,
	name: "Mobile app v2",
	description:
		"Rewrite of the mobile client: new data model, auth, CI and a release train.",
});
const names = [
	"Design data model",
	"Write API spec",
	"Implement auth",
	"Wire up DB migrations",
	"Project setup & scaffolding",
	"Set up CI pipeline",
	"Write unit tests for auth",
	"Build profile page",
	"Ship release candidate",
	"Code review pass",
	"Docs for onboarding",
	"Load testing",
];
const made: string[] = [];
for (const n of names) {
	made.push(
		createTask(seedCtx, {
			epic: seedEpic.id,
			name: n,
			description: n === "Implement auth" ? "JWT + refresh tokens" : undefined,
		}).id,
	);
}
claimTask(seedCtx, { taskId: made[0], agent: "agent-1" });
submitTask(seedCtx, { taskId: made[0], reviewer: "reviewer-2" });
approveTask(seedCtx, { taskId: made[0], as: "reviewer-2" });
claimTask(seedCtx, { taskId: made[1], agent: "agent-2" });
submitTask(seedCtx, { taskId: made[1], reviewer: "reviewer-2" });
claimTask(seedCtx, { taskId: made[3], agent: "agent-1" });
createTask(seedCtx, {
	epic: seedEpic.id,
	name: "Post-launch analytics",
	dependsOn: [made[8]],
});
createTask(seedCtx, {
	epic: seedEpic.id,
	name: "Beta feedback triage",
	dependsOn: [made[8]],
});
const longEpic = createEpic(seedCtx, {
	project: seedProject.id,
	name: "Design system & theming",
});
for (let i = 0; i < 6; i += 1) {
	createTask(seedCtx, { epic: longEpic.id, name: `Design token 0${i + 1}` });
}
for (let i = 0; i < 5; i += 1) {
	createEpic(seedCtx, {
		project: seedProject2.id,
		name: `Backlog item ${i + 1}`,
	});
}

const ctx = createContext(openDb("/tmp/opencode/preview.db"));
const project = ctx.projects.findAll()[0]!;
const epic = ctx.epics.findByProject(project.id)[0]!;
const tasks = ctx.tasks.findByEpic(epic.id);
const detailTask = tasks[0]!;

function frame(state: Partial<AppState>): string {
	return paint({ ...initialAppState(), ...state }, ctx, width, height);
}

const selectorOut = frame({});
const boardState: AppState = {
	...initialAppState(),
	screen: "board",
	epicId: epic.id,
};
const boardOut = paint(boardState, ctx, width, height);
const detailState: AppState = {
	...initialAppState(),
	screen: "detail",
	epicId: epic.id,
	taskId: detailTask.id,
};
const detailOut = paint(detailState, ctx, width, height);

const out: string[] = [];
out.push(`W=${width} H=${height}`);
out.push("=== SELECTOR ===");
out.push(selectorOut);
out.push("");
out.push("=== BOARD ===");
out.push(boardOut);
out.push("");
out.push("=== TASK DETAIL ===");
out.push(detailOut);

process.stderr.write(
	`lines selector=${selectorOut.split("\n").length} board=${
		boardOut.split("\n").length
	} detail=${detailOut.split("\n").length} rows=${height}\n`,
);
process.stdout.write(`${out.join("\n")}\n`);
