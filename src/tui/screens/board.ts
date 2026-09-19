import chalk from "chalk";
import type { ChalkInstance } from "chalk";
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
} from "../theme.ts";
import {
	background,
	color,
	columns,
	narrow,
	plainWidth,
	seg,
} from "../layout.ts";
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
const MIN_COL_W = 20;
const CARD_LINES = 3;

/** Border + padding on each side of a column's content: `│ … │`. */
const BOX_INSET = 4;

/**
 * Lines used around the card rows: header (6) + footer (2) + each column's
 * title bar, guide line and bottom border (3) + the "↑ above" / "↓ below" rows (2).
 */
const BOARD_CHROME = 13;

export interface BoardData {
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

export const EMPTY_BOARD: BoardData = {
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

export function loadBoard(ctx: CommandContext, epicId: string | null): BoardData {
	if (!epicId) return EMPTY_BOARD;
	const detail = getEpicDetail(ctx, epicId);
	const events = ctx.events.listByEpic(epicId, { limit: 40 });
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
	data: BoardData,
	st: AppState,
	w: number,
	h: number,
	error?: string,
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
	} = error !== undefined ? EMPTY_BOARD : data;

	const byColumn = new Map<TaskStatus, TaskWithGraph[]>();
	for (const c of COLUMNS) byColumn.set(c, []);
	for (const t of tasks) (byColumn.get(t.status as TaskStatus) ?? []).push(t);

	const showSidebar = w >= SIDEBAR_MIN_WIDTH;
	const avail = w - (showSidebar ? SIDEBAR_W + 1 : 1);
	const fit = Math.min(
		COLUMNS.length,
		Math.max(1, Math.floor((avail + GUTTER) / (MIN_COL_W + GUTTER))),
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
				subtitle: error !== undefined
					? `⚠ ${error}`
					: description
						? `${projectName} · ${description}`
						: projectName,
				extra: error === undefined
					? [
						seg(progressBar(percentDone, 26), color("green")),
						seg(
							` ${percentDone}% complete · ${total} tasks · ${
								active > 0 ? `${active} in flight` : "nothing in flight"
							}`,
							chalk.bold,
						),
					]
					: undefined,
			},
		),
	);

	const afterHeader = lines.length;
	const areaH = h - afterHeader - 2;
	const inner = colW - BOX_INSET;

	const cols: Seg[][][] = visible.map((column, vi) => {
		const list = byColumn.get(column) ?? [];
		const isActive = vi === activePos;
		const shown = isActive ? activeView : list.slice(0, cardH);
		const before = isActive ? offset : 0;
		const overflow = list.length - (before + shown.length);
		const border = isActive
			? color(STATUS_COLORS[column] ?? "gray").bold
			: chalk.dim;

		const body: Seg[][] = [];
		if (before > 0) body.push([seg(`↑ ${before} above`, chalk.dim)]);
		for (let ri = 0; ri < shown.length; ri += 1) {
			body.push(
				...taskCard(shown[ri]!, isActive && ri === row - offset, inner),
			);
		}
		if (shown.length === 0) body.push([seg("— empty —", chalk.dim)]);
		if (overflow > 0) body.push([seg(`↓ ${overflow} below`, chalk.dim)]);

		const bodyH = Math.max(0, areaH - 3);
		const cells: Seg[][] = [
			columnTop(column, list.length, isActive, colW, border),
			boxRow([seg(STATUS_GUIDES[column] ?? "", chalk.dim)], inner, border),
		];
		for (let i = 0; i < bodyH; i += 1)
			cells.push(boxRow(body[i] ?? [], inner, border));
		cells.push([seg(`╰${"─".repeat(colW - 2)}╯`, border)]);
		return cells;
	});

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
	for (let i = 0; i < Math.min(panel.length, areaH); i += 1)
		lines.push(panel[i]!);
	for (let i = panel.length; i < areaH; i += 1) lines.push("");

	const colLabel = COLUMNS[st.col] ?? "todo";
	const taskCount =
		activeList.length > 0
			? `${colLabel} (${st.col + 1}/${COLUMNS.length}) · task ${row + 1}/${activeList.length}`
			: `${colLabel} (${st.col + 1}/${COLUMNS.length}) · 0 tasks`;
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

/**
 * Title bar that doubles as the top edge of a column's box:
 * `╭ ◐ in_progress ───── 3 ╮`. The active column gets a filled status pill.
 */
function columnTop(
	column: TaskStatus,
	count: number,
	active: boolean,
	width: number,
	border: ChalkInstance,
): Seg[] {
	const accent = color(STATUS_COLORS[column] ?? "gray");
	const title = ` ${STATUS_GLYPHS[column] ?? "·"} ${column} `;
	const tail = ` ${count > 99 ? "99+" : count} `;
	const fill = Math.max(0, width - 2 - title.length - tail.length);
	return [
		seg("╭", border),
		seg(
			title,
			active
				? background(STATUS_COLORS[column] ?? "gray").black.bold
				: accent.bold,
		),
		seg("─".repeat(fill), border),
		seg(tail, active ? accent.bold : chalk.dim),
		seg("╮", border),
	];
}

/** One row of a column's box: `│ content │`, content padded/cut to `inner`. */
function boxRow(
	content: readonly Seg[],
	inner: number,
	border: ChalkInstance,
): Seg[] {
	const cut = narrow(content, inner);
	return [
		seg("│ ", border),
		...cut,
		seg(" ".repeat(Math.max(0, inner - plainWidth(cut)))),
		seg(" │", border),
	];
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
			seg(` ${ellipsize(task.name, Math.max(1, width - 4))}`, item),
		],
		[seg(`  ${ellipsize(meta, Math.max(4, width - 2))}`, chalk.dim)],
		[],
	];
}
