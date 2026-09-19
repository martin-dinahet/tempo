import chalk from "chalk";
import type { CommandContext } from "../../context.ts";
import type { Epic, Project, Task, TaskStatus } from "../../domain/types.ts";
import {
	STATUS_GLYPHS,
	ellipsize,
	formatDate,
	progressBar,
	shortId,
	shortLabel,
} from "../theme.ts";
import { color, columns, justifySegs, seg } from "../layout.ts";
import type { Seg } from "../layout.ts";
import { footer, header } from "../chrome.ts";
import type { AppState } from "../state.ts";

interface EpicStat {
	epic: Epic;
	total: number;
	done: number;
	active: number;
	pct: number;
}

interface ProjectRow {
	project: Project;
	epicStats: EpicStat[];
	taskCount: number;
	doneCount: number;
	activeCount: number;
	byStatus: Record<TaskStatus, number>;
}

const EMPTY_STATUS: Record<TaskStatus, number> = {
	todo: 0,
	blocked: 0,
	in_progress: 0,
	in_review: 0,
	done: 0,
	cancelled: 0,
};

/** Load projects with per-epic progress stats. */
export function loadProjects(ctx: CommandContext): ProjectRow[] {
	const all = ctx.tasks.findByEpic(undefined);
	const byEpic = new Map<string, Task[]>();
	for (const t of all) {
		const list = byEpic.get(t.epic_id) ?? [];
		list.push(t);
		byEpic.set(t.epic_id, list);
	}
	const stat = (epicId: string) => {
		const tasks = byEpic.get(epicId) ?? [];
		let done = 0;
		let active = 0;
		for (const t of tasks) {
			if (t.status === "done") done += 1;
			else if (t.status === "in_progress" || t.status === "in_review")
				active += 1;
		}
		return { total: tasks.length, done, active };
	};
	return ctx.projects.findAll().map((project) => {
		const epicStats = ctx.epics.findByProject(project.id).map((epic) => {
			const s = stat(epic.id);
			return {
				epic,
				total: s.total,
				done: s.done,
				active: s.active,
				pct: s.total === 0 ? 0 : Math.round((s.done / s.total) * 100),
			};
		});
		const byStatus = { ...EMPTY_STATUS } as Record<TaskStatus, number>;
		let taskCount = 0;
		let doneCount = 0;
		let activeCount = 0;
		for (const e of epicStats) {
			taskCount += e.total;
			doneCount += e.done;
			activeCount += e.active;
			for (const t of byEpic.get(e.epic.id) ?? []) byStatus[t.status] += 1;
		}
		return { project, epicStats, taskCount, doneCount, activeCount, byStatus };
	});
}

/** How many project / epic rows fit in a panel at height `h`. */
export function selectorLayout(h: number): number {
	return Math.max(1, Math.floor(Math.max(4, h - 9) / 2));
}

const ITEM_STYLE = (current: boolean) =>
	current ? chalk.cyan.bold : chalk.reset;

export function renderSelector(
	ctx: CommandContext,
	st: AppState,
	w: number,
	h: number,
): string[] {
	const projects = loadProjects(ctx);
	const pIndex = Math.min(st.pIndex, Math.max(0, projects.length - 1));
	const sel = projects[pIndex];
	const eMax = Math.max(0, (sel?.epicStats.length ?? 0) - 1);
	const eIndex = Math.min(st.eIndex, eMax);
	const visible = selectorLayout(h);
	const maxScrollP = Math.max(0, projects.length - visible);
	const maxScrollE = Math.max(0, (sel?.epicStats.length ?? 0) - visible);
	const scrollP = Math.min(st.scrollP, maxScrollP);
	const scrollE = Math.min(st.scrollE, maxScrollE);

	const lines: string[] = [];
	lines.push(
		...header(
			[
				seg("projects", chalk.white.bold),
				seg(` › ${sel?.project.name ?? "…"}`, chalk.dim),
			],
			w,
			{
				right: sel ? [seg(shortId(sel.project.id), chalk.dim)] : [],
				subtitle: "pick a project, then drill into an epic to open its board",
			},
		),
	);

	const leftW = Math.min(40, Math.floor((w - 1) / 2));
	const rightW = w - 1 - leftW;

	const leftCol: Seg[][] = [];
	leftCol.push([seg("Projects", color("cyan").bold)]);
	leftCol.push([seg("select a project", chalk.dim)]);
	leftCol.push([]);
	if (projects.length === 0) {
		leftCol.push([
			seg("(no projects — run `tempo project create`)", chalk.dim),
		]);
	}
	for (
		let i = scrollP;
		i < Math.min(projects.length, scrollP + visible);
		i += 1
	) {
		const p = projects[i]!;
		const current = i === pIndex;
		const item = ITEM_STYLE(current);
		leftCol.push([seg(current ? "▸ " : "  ", item), seg(p.project.name, item)]);
		leftCol.push([
			seg(
				`  ${p.epicStats.length} epic${p.epicStats.length === 1 ? "" : "s"} · ${p.taskCount} task${p.taskCount === 1 ? "" : "s"} · ${p.doneCount} done`,
				chalk.dim,
			),
		]);
	}
	if (maxScrollP > 0) {
		leftCol.push([
			seg(
				`… ${Math.min(maxScrollP, projects.length - scrollP - visible)} more off-screen`,
				chalk.dim,
			),
		]);
	}

	const rightCol: Seg[][] = [];
	if (st.level === 0) {
		if (sel) {
			const { project } = sel;
			const statuses: TaskStatus[] = [
				"blocked",
				"todo",
				"in_progress",
				"in_review",
				"done",
				"cancelled",
			];
			rightCol.push([seg(project.name, color("cyan").bold)]);
			rightCol.push([
				seg(project.description ?? "(no description)", chalk.dim),
			]);
			rightCol.push([
				seg(
					statuses
						.map(
							(s) =>
								`${STATUS_GLYPHS[s] ?? "·"} ${shortLabel(s)} ${sel.byStatus[s]} `,
						)
						.join(""),
				),
			]);
			rightCol.push([
				seg(
					`created ${formatDate(project.created_at)} · id ${project.id}`,
					chalk.dim,
				),
			]);
		} else {
			rightCol.push([seg("…", chalk.dim)]);
		}
	} else {
		rightCol.push([
			seg(`Epics in ${sel?.project.name ?? "?"}`, color("cyan").bold),
		]);
		rightCol.push([seg("pick an epic to open its board", chalk.dim)]);
		rightCol.push([]);
		if (!sel || sel.epicStats.length === 0) {
			rightCol.push([seg("(no epics yet)", chalk.dim)]);
		} else {
			for (
				let i = scrollE;
				i < Math.min(sel.epicStats.length, scrollE + visible);
				i += 1
			) {
				const s = sel.epicStats[i]!;
				const current = i === eIndex;
				const item = ITEM_STYLE(current);
				rightCol.push(
					justifySegs(
						[seg(current ? "▸ " : "  ", item), seg(s.epic.name, item)],
						[
							seg(
								s.total > 0 ? `${s.done}/${s.total} · ${s.pct}%` : "0 tasks",
								chalk.dim,
							),
						],
						rightW,
					),
				);
				rightCol.push(
					justifySegs(
						[
							seg("  "),
							seg(
								s.total > 0 ? progressBar(s.pct, 12) : "░".repeat(12),
								color("green"),
							),
						],
						[
							seg(
								ellipsize(
									s.epic.description ?? "(no description)",
									Math.max(8, rightW - 28),
								),
								chalk.dim,
							),
						],
						rightW,
					),
				);
			}
		}
		if (maxScrollE > 0) {
			rightCol.push([
				seg(
					`… ${Math.min(maxScrollE, maxScrollE - scrollE)} more off-screen`,
					chalk.dim,
				),
			]);
		}
	}

	const panel = columns([leftCol, rightCol], [leftW, rightW], " ");
	lines.push(...panel);
	// Pad so the footer sits at the bottom of the terminal.
	const panelEnd = h - 2;
	for (let i = lines.length; i < panelEnd; i += 1) lines.push("");

	const projectName = sel?.project.name ?? "";
	lines.push(
		...footer(
			[seg("↑↓ move · enter/→ drill in · ←/esc back · q quit", chalk.dim)],
			w,
			sel
				? [seg(`${projectName} · ${shortId(sel.project.id)}`, chalk.dim)]
				: undefined,
		),
	);
	return lines;
}
