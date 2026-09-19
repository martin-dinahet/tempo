import chalk from "chalk";
import type { CommandContext } from "../../context.ts";
import type { AppEvent, TaskStatus } from "../../domain/types.ts";
import { getEpicDetail } from "../../services/queries.ts";
import type { TaskWithGraph } from "../../services/queries.ts";
import {
	STATUS_COLORS,
	STATUS_GLYPHS,
	STATUS_GUIDES,
	ellipsize,
	formatClock,
	formatEvent,
	progressBar,
	shortLabel,
} from "../theme.ts";
import { background, color, columns, line, seg } from "../layout.ts";
import type { Seg } from "../layout.ts";
import { footer, header } from "../chrome.ts";
import type { AppState } from "../state.ts";

export const COLUMNS: readonly TaskStatus[] = [
	"blocked",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
];

const SIDEBAR_W = 34;
const SIDEBAR_MIN_WIDTH = 116;
const GUTTER = 1;
const MIN_COL_W = 16;
const CARD_LINES = 3;

/** Lines used by header + status strip + footer around the columns area. */
const BOARD_CHROME = 10;

interface BoardData {
	projectName: string;
	name: string;
	description: string | null;
	percentDone: number;
	total: number;
	active: number;
	status: string;
	tasks: TaskWithGraph[];
	events: AppEvent[];
	bare: boolean;
}

const EMPTY_BOARD: BoardData = {
	projectName: "",
	name: "…",
	description: null,
	percentDone: 0,
	total: 0,
	active: 0,
	status: "empty",
	tasks: [],
	events: [],
	bare: true,
};

function loadBoard(ctx: CommandContext, epicId: string | null): BoardData {
	if (!epicId) return EMPTY_BOARD;
	let detail: ReturnType<typeof getEpicDetail> | undefined;
	try {
		detail = getEpicDetail(ctx, epicId);
	} catch {
		return EMPTY_BOARD;
	}
	const events = (() => {
		try {
			return ctx.events.listByEpic(epicId, { limit: 40 });
		} catch {
			return [];
		}
	})();
	return {
		projectName:
			ctx.projects.findById(detail.project_id)?.name ?? "unknown project",
		name: detail.name,
		description: detail.description,
		percentDone: detail.summary.percent_done ?? 0,
		total: detail.summary.total ?? 0,
		status: detail.status,
		active: (detail.summary.in_progress ?? 0) + (detail.summary.in_review ?? 0),
		tasks: detail.tasks,
		events,
		bare: false,
	};
}

/** How many card rows fit below the chrome at height `h`. */
export function boardLayout(h: number): number {
	return Math.max(1, Math.floor((h - BOARD_CHROME) / CARD_LINES));
}

export function renderBoard(
	ctx: CommandContext,
	st: AppState,
	w: number,
	h: number,
): string[] {
	const {
		bare,
		status,
		name,
		description,
		projectName,
		percentDone,
		total,
		active,
		events,
		tasks,
	} = loadBoard(ctx, st.epicId);

	const byColumn = new Map<TaskStatus, TaskWithGraph[]>();
	for (const c of COLUMNS) byColumn.set(c, []);
	for (const t of tasks) (byColumn.get(t.status as TaskStatus) ?? []).push(t);

	const showSidebar = w >= SIDEBAR_MIN_WIDTH;
	const avail = w - (showSidebar ? SIDEBAR_W + 1 : 1);
	const fit = Math.min(
		COLUMNS.length,
		Math.max(1, Math.floor(avail / (MIN_COL_W + GUTTER))),
	);
	const colW = Math.max(
		MIN_COL_W,
		Math.floor((avail - (fit - 1) * GUTTER) / fit),
	);
	const start = Math.min(
		Math.max(0, st.col - Math.floor((fit - 1) / 2)),
		COLUMNS.length - fit,
	);
	const visible = COLUMNS.slice(start, start + fit);
	const activePos = st.col - start;

	const cardH = boardLayout(h);
	const activeList = byColumn.get(COLUMNS[st.col] ?? "todo") ?? [];
	const row = Math.min(st.row, Math.max(0, activeList.length - 1));
	const offset = Math.min(
		Math.max(0, activeList.length - cardH),
		Math.max(0, row - cardH + 1),
	);
	const activeView = activeList.slice(offset, offset + cardH);

	const lines: string[] = [];
	lines.push(
		...header(
			[seg("epic", chalk.white.bold), seg(` › ${name}`, chalk.reset)],
			w,
			{
				right: bare ? undefined : [statusBadge(status)],
				subtitle: description ? `${projectName} · ${description}` : projectName,
				extra: [
					seg(progressBar(percentDone, 26), color("green")),
					seg(
						` ${percentDone}% complete · ${total} tasks · ${
							active > 0 ? `${active} in flight` : "nothing in flight"
						}`,
						chalk.bold,
					),
				],
			},
		),
	);

	const strip: Seg[] = [];
	for (let ci = 0; ci < COLUMNS.length; ci += 1) {
		const column = COLUMNS[ci]!;
		const n = byColumn.get(column)?.length ?? 0;
		const label = w < 118 ? shortLabel(column) : column;
		if (ci > 0) strip.push(seg("   "));
		strip.push(
			seg(
				` ${STATUS_GLYPHS[column] ?? "·"} ${label} ${n} `,
				ci === st.col ? chalk.inverse.white.bold : chalk.gray,
			),
		);
	}
	lines.push(line(strip, w));

	const cols: Seg[][][] = visible.map((column, vi) => {
		const list = byColumn.get(column) ?? [];
		const isActive = vi === activePos;
		const shown = isActive ? activeView : list.slice(0, cardH);
		const before = isActive ? offset : 0;
		const overflow = list.length - (before + shown.length);
		const cells: Seg[][] = [
			columnHeader(column, list.length, isActive, colW),
			[seg(isActive ? "" : (STATUS_GUIDES[column] ?? ""), chalk.dim)],
			[],
		];
		if (before > 0) cells.push([seg(`↑ ${before} above`, chalk.dim)]);
		for (let ri = 0; ri < shown.length; ri += 1) {
			cells.push(
				...taskCard(shown[ri]!, isActive && ri === row - offset, colW),
			);
		}
		if (shown.length === 0) cells.push([seg("— empty —", chalk.dim)]);
		if (overflow > 0) cells.push([seg(`↓ ${overflow} below`, chalk.dim)]);
		return cells;
	});

	const afterStrip = lines.length;
	const feedLimit = Math.max(1, h - 12);
	const sidebarCells: Seg[][] = [
		[seg("Recent activity", chalk.white.bold)],
		[seg("live audit trail · polling", chalk.dim)],
		[],
	];
	if (events.length === 0)
		sidebarCells.push([seg("(no events yet)", chalk.dim)]);
	const taskNames = new Map(tasks.map((t) => [t.id, t.name]));
	const resolveName = (id: string) => taskNames.get(id) ?? "?";
	for (const e of events.slice(-feedLimit).reverse()) {
		const l = formatEvent(e, resolveName);
		sidebarCells.push([
			seg(formatClock(e.created_at), chalk.gray),
			seg(` ${l.label} `, color(l.color)),
			seg(l.subject),
			seg(` ${ellipsize(l.suffix, 10)}`, chalk.dim),
			seg(` [${ellipsize(e.actor, 10)}]`, chalk.dim),
		]);
	}

	const widths = showSidebar
		? [...visible.map(() => colW), SIDEBAR_W]
		: visible.map(() => colW);
	const panelCols = showSidebar ? [...cols, sidebarCells] : cols;
	const panel = columns(panelCols, widths, " ");
	const areaH = h - afterStrip - 2;
	for (let i = 0; i < Math.min(panel.length, areaH); i += 1)
		lines.push(panel[i]!);
	for (let i = panel.length; i < areaH; i += 1) lines.push("");

	const colLabel = COLUMNS[st.col] ?? "todo";
	const taskCount =
		activeList.length > 0
			? `${colLabel} · task ${row + 1}/${activeList.length}`
			: `${colLabel} · 0 tasks`;
	lines.push(
		...footer(
			[
				seg(
					"←→ or tab column · ↑↓ task · pgup/pgdn page · enter detail · esc back",
					chalk.dim,
				),
			],
			w,
			[seg(taskCount, chalk.dim)],
		),
	);
	return lines;
}

function statusBadge(status: string): Seg {
	const colors: Record<string, string> = {
		done: "green",
		in_progress: "yellow",
		empty: "gray",
	};
	return seg(` ${status} `, background(colors[status] ?? "blue").black.bold);
}

function columnHeader(
	column: TaskStatus,
	count: number,
	active: boolean,
	width: number,
): Seg[] {
	const accent = color(STATUS_COLORS[column] ?? "gray");
	const text = ` ${STATUS_GLYPHS[column] ?? "·"} ${column} ${count} `.padEnd(
		width,
		" ",
	);
	return [active ? seg(text, accent.black.bold) : seg(text, accent)];
}

function taskCard(
	task: TaskWithGraph,
	selected: boolean,
	width: number,
): Seg[][] {
	const accent = color(STATUS_COLORS[task.status] ?? "gray");
	const meta = [
		task.assigned_agent ? `@${task.assigned_agent}` : "unassigned",
		task.reviewer ? `→ @${task.reviewer}` : "",
		formatClock(task.created_at),
	]
		.filter(Boolean)
		.join(" · ");
	const item = selected ? chalk.white.bold : chalk.reset;
	return [
		[
			seg(selected ? "▸ " : "  ", item),
			seg(STATUS_GLYPHS[task.status] ?? "·", selected ? item : accent),
			seg(` ${task.name}`, item),
		],
		[seg(ellipsize(meta, Math.max(4, width - 2)), chalk.dim)],
		[],
	];
}
