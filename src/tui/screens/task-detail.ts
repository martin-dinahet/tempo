import chalk from "chalk";
import type { TaskDetail as TaskDetailData } from "../../services/queries.ts";
import {
	STATUS_COLORS,
	STATUS_GLYPHS,
	formatClock,
	formatDate,
	formatEvent,
	shortLabel,
} from "../theme.ts";
import {
	background,
	color,
	columns,
	justifySegs,
	line,
	seg,
} from "../layout.ts";
import type { Seg } from "../layout.ts";
import { footer, header } from "../chrome.ts";
import type { AppState } from "../state.ts";

// Named layout constants so changes to the detail screen stay self-documenting.
const HEADER_ROWS = 4; // brand line, blank, title row (no subtitle/extra), rule
const TITLE_ROW = 1; // glyph + task name + status badge
const META_ROWS = 2; // assignee/reviewer/status + created/updated/id
const DESC_ROW = 1; // description
const HISTORY_LABEL_ROW = 1; // "History" label + scroll hint
const FOOTER_ROWS = 2; // rule + key-hints line

/** Lines available for the event history at terminal height `h`. */
export function historyHeight(detail: TaskDetailData, h: number): number {
	const edgeRows =
		2 +
		Math.max(1, Math.max(detail.dependencies.length, detail.dependents.length));
	const chrome =
		HEADER_ROWS + TITLE_ROW + META_ROWS + DESC_ROW + edgeRows + HISTORY_LABEL_ROW + FOOTER_ROWS;
	return Math.max(1, h - chrome);
}

export function renderTaskDetail(
	detail: TaskDetailData | null,
	st: AppState,
	w: number,
	h: number,
	error?: string,
): string[] {
	const crumb: Seg[] = [
		seg("task", chalk.white.bold),
		...(st.projectName ? [seg(` › ${st.projectName}`, chalk.dim)] : []),
		...(st.epicName ? [seg(` › ${st.epicName}`, chalk.dim)] : []),
	];

	const lines: string[] = [];
	lines.push(...header(crumb, w));

	if (error !== undefined) {
		lines.push(line([seg(`⚠ ${error}`, chalk.red)], w));
		for (let i = lines.length; i < h; i += 1) lines.push("");
		return lines;
	}

	if (!detail) {
		lines.push(line([seg("…", chalk.dim)], w));
		for (let i = lines.length; i < h; i += 1) lines.push("");
		return lines;
	}

	const task = detail.task;
	const accent = color(STATUS_COLORS[task.status] ?? "gray");
	const badge = seg(
		` ${task.status} `,
		background(STATUS_COLORS[task.status] ?? "gray").black.bold,
	);

	lines.push(
		line(
			justifySegs(
				[
					seg(STATUS_GLYPHS[task.status] ?? "·", accent),
					seg(` ${task.name}`, chalk.white.bold),
				],
				[badge],
				w,
			),
			w,
		),
	);
	lines.push(
		line(
			[
				seg("assignee ", chalk.dim),
				seg(
					task.assigned_agent ? `@${task.assigned_agent}` : "unassigned",
					chalk.bold,
				),
				seg("  reviewer ", chalk.dim),
				seg(task.reviewer ? `@${task.reviewer}` : "none", chalk.bold),
				seg("  status ", chalk.dim),
				seg(shortLabel(task.status), accent.bold),
			],
			w,
		),
	);
	lines.push(
		line(
			[
				seg("created ", chalk.dim),
				seg(formatDate(task.created_at)),
				seg("  updated ", chalk.dim),
				seg(formatDate(task.updated_at)),
				seg("  id ", chalk.dim),
				seg(task.id, chalk.dim),
			],
			w,
		),
	);
	lines.push(
		line(
			[
				seg(
					task.description?.length ? task.description : "(no description)",
					chalk.dim,
				),
			],
			w,
		),
	);

	const depsW = Math.min(34, Math.max(20, Math.floor((w - 3) / 2)));
	const waitingW = Math.max(20, w - 3 - depsW);
	const depsCol: Seg[][] = edgeColumn("Dependencies", detail.dependencies);
	const waitingCol: Seg[][] = edgeColumn("Waiting on this", detail.dependents);
	lines.push(...columns([depsCol, waitingCol], [depsW, waitingW], " "));

	const historyLines = historyHeight(detail, h);
	const feed = detail.events.slice().reverse();
	const maxScroll = Math.max(0, feed.length - historyLines);
	const dscroll = Math.min(st.dscroll, maxScroll);
	const visible = feed.slice(dscroll, dscroll + historyLines);
	const resolveName = (id: string) =>
		detail.dependencies.find((d) => d.task_id === id)?.name ??
		detail.dependents.find((d) => d.task_id === id)?.name ??
		(id === task.id ? task.name : "?");

	lines.push(
		line(
			justifySegs(
				[seg("History", chalk.white.bold)],
				[
					seg(
						maxScroll > 0
							? `↑↓ scroll · showing ${feed.length === 0 ? 0 : dscroll + 1}–${Math.min(feed.length, dscroll + historyLines)} of ${feed.length}`
							: "↑↓ scroll · esc back",
						chalk.dim,
					),
				],
				w,
			),
			w,
		),
	);
	if (visible.length === 0)
		lines.push(line([seg("(no events yet)", chalk.dim)], w));
	for (const e of visible) {
		const l = formatEvent(e, resolveName);
		lines.push(
			line(
				[
					seg(formatClock(e.created_at), chalk.gray),
					seg(` ${l.label} `, color(l.color)),
					seg(l.subject),
					seg(" ", chalk.dim),
					seg(l.suffix, chalk.dim),
					seg(` [${e.actor}]`, chalk.dim),
				],
				w,
			),
		);
	}

	lines.push(
		...footer([seg("↑↓ scroll history · esc back · q quit", chalk.dim)], w, [
			seg(
				`${detail.computed_status} · ${detail.events.length} events`,
				chalk.dim,
			),
		]),
	);
	return lines;
}

/** Column of edges (deps / dependents) plus a trailing blank padding row. */
function edgeColumn(
	label: string,
	edges: TaskDetailData["dependencies"],
): Seg[][] {
	const cells: Seg[][] = [[seg(label, chalk.white.bold)]];
	if (edges.length === 0) {
		cells.push([seg("(none)", chalk.dim)]);
	} else {
		for (const e of edges) {
			cells.push([
				seg(
					STATUS_GLYPHS[e.status] ?? "·",
					color(STATUS_COLORS[e.status] ?? "gray"),
				),
				seg(` ${e.name}`),
			]);
		}
	}
	cells.push([]);
	return cells;
}
