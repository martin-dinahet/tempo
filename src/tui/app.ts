import type { CommandContext } from "../context.ts";
import { getEpicDetail, getTaskDetail } from "../services/queries.ts";
import type { KeyEvent } from "./keys.ts";
import {
	renderSelector,
	loadProjects,
	selectorLayout,
} from "./screens/selector.ts";
import { renderBoard, boardLayout, COLUMNS } from "./screens/board.ts";
import { renderTaskDetail, historyHeight } from "./screens/task-detail.ts";
import type { AppState } from "./state.ts";

/**
 * Render the current screen to a full `h`-line frame, every line exactly `w`
 * characters wide. Pure function over (state, ctx) so it is easy to preview
 * and test headlessly.
 */
export function paint(
	state: AppState,
	ctx: CommandContext,
	w: number,
	h: number,
): string {
	const lines = renderLines(state, ctx, w, h);
	const rows: string[] = [];
	for (let i = 0; i < h; i += 1) {
		const l = lines[i] ?? "";
		rows.push(l.length >= w ? l : `${l}${" ".repeat(w - l.length)}`);
	}
	return rows.join("\n");
}

function renderLines(
	state: AppState,
	ctx: CommandContext,
	w: number,
	h: number,
): string[] {
	switch (state.screen) {
		case "selector":
			return renderSelector(ctx, state, w, h);
		case "board":
			return renderBoard(ctx, state, w, h);
		case "detail":
			return renderTaskDetail(ctx, state, w, h);
	}
}

/**
 * Apply one keypress to the app state. Returns true when the user wants to
 * quit the TUI (the caller tears down and exits).
 */
export function handleKey(
	state: AppState,
	ctx: CommandContext,
	key: KeyEvent,
	_w: number,
	h: number,
): boolean {
	if (key.code === "char" && (key.input === "q" || key.input === "\u0003"))
		return true;

	switch (state.screen) {
		case "selector":
			return selectorKey(state, ctx, key, h);
		case "board":
			return boardKey(state, ctx, key, h);
		case "detail":
			return detailKey(state, ctx, key, h);
	}
}

function selectorKey(
	state: AppState,
	ctx: CommandContext,
	key: KeyEvent,
	h: number,
): boolean {
	const projects = loadProjects(ctx);
	const sel = projects[state.pIndex];
	const visible = selectorLayout(h);

	const moveP = (next: number) => {
		state.pIndex = next;
		if (next > state.scrollP + visible - 1) state.scrollP = next - visible + 1;
		else if (next < state.scrollP) state.scrollP = next;
	};
	const moveE = (next: number) => {
		state.eIndex = next;
		if (next > state.scrollE + visible - 1) state.scrollE = next - visible + 1;
		else if (next < state.scrollE) state.scrollE = next;
	};

	switch (key.code) {
		case "up":
			if (state.level === 0) moveP(Math.max(0, state.pIndex - 1));
			else moveE(Math.max(0, state.eIndex - 1));
			break;
		case "down":
			if (state.level === 0)
				moveP(Math.min(Math.max(0, projects.length - 1), state.pIndex + 1));
			else
				moveE(
					Math.min(
						Math.max(0, (sel?.epicStats.length ?? 0) - 1),
						state.eIndex + 1,
					),
				);
			break;
		case "pageup":
			if (state.level === 0) {
				const next = Math.max(0, state.pIndex - visible);
				state.pIndex = next;
				state.scrollP = next;
			} else {
				const next = Math.max(0, state.eIndex - visible);
				state.eIndex = next;
				state.scrollE = next;
			}
			break;
		case "pagedown":
			if (state.level === 0) {
				const next = Math.min(
					Math.max(0, projects.length - 1),
					state.pIndex + visible,
				);
				state.pIndex = next;
				state.scrollP = next;
			} else {
				const next = Math.min(
					Math.max(0, (sel?.epicStats.length ?? 0) - 1),
					state.eIndex + visible,
				);
				state.eIndex = next;
				state.scrollE = next;
			}
			break;
		case "enter":
		case "right":
			if (state.level === 0 && sel) {
				state.level = 1;
				state.eIndex = 0;
				state.scrollE = 0;
				state.projectId = sel.project.id;
			} else if (state.level === 1 && sel) {
				const epic = sel.epicStats[state.eIndex]?.epic;
				if (epic) {
					state.epicId = epic.id;
					state.screen = "board";
					state.col = 0;
					state.row = 0;
				}
			}
			break;
		case "escape":
		case "left":
			if (state.level === 1) {
				state.level = 0;
			} else {
				return true;
			}
			break;
		default:
			break;
	}
	return false;
}

function boardKey(
	state: AppState,
	ctx: CommandContext,
	key: KeyEvent,
	h: number,
): boolean {
	const columnTasks = (() => {
		try {
			return getEpicDetail(ctx, state.epicId ?? "").tasks;
		} catch {
			return [];
		}
	})();
	const inColumn = (col: number) =>
		columnTasks.filter((t) => t.status === COLUMNS[col]).length;
	const columnList = (col: number) =>
		columnTasks.filter((t) => t.status === COLUMNS[col]);
	const cardH = boardLayout(h);

	switch (key.code) {
		case "escape":
			state.screen = "selector";
			break;
		case "tab":
			if (key.shift) state.col = Math.max(0, state.col - 1);
			else state.col = Math.min(COLUMNS.length - 1, state.col + 1);
			state.row = 0;
			break;
		case "left":
			state.col = Math.max(0, state.col - 1);
			state.row = 0;
			break;
		case "right":
			state.col = Math.min(COLUMNS.length - 1, state.col + 1);
			state.row = 0;
			break;
		case "up":
			state.row = Math.max(0, state.row - 1);
			break;
		case "down":
			state.row = Math.min(Math.max(0, inColumn(state.col) - 1), state.row + 1);
			break;
		case "pageup":
			state.row = Math.max(0, state.row - cardH);
			break;
		case "pagedown":
			state.row = Math.min(
				Math.max(0, inColumn(state.col) - 1),
				state.row + cardH,
			);
			break;
		case "enter":
			{
				const task = columnList(state.col)[state.row];
				if (task) {
					state.taskId = task.id;
					state.dscroll = 0;
					state.screen = "detail";
				}
			}
			break;
		default:
			break;
	}
	return false;
}

function detailKey(
	state: AppState,
	ctx: CommandContext,
	key: KeyEvent,
	h: number,
): boolean {
	let feedLen = 0;
	let historyLines = 10;
	if (state.taskId) {
		try {
			const detail = getTaskDetail(ctx, state.taskId);
			feedLen = detail.events.length;
			historyLines = historyHeight(detail, h);
		} catch {
			// task went away; treat as empty
		}
	}

	switch (key.code) {
		case "escape":
			state.screen = "board";
			break;
		case "up":
		case "pageup":
			state.dscroll = Math.max(0, state.dscroll - 1);
			break;
		case "down":
		case "pagedown":
			state.dscroll = Math.min(
				Math.max(0, feedLen - historyLines),
				state.dscroll + 1,
			);
			break;
		default:
			break;
	}
	return false;
}
