import chalk from "chalk";
import type { FrameData, ProjectRow, TaskDetail } from "./frame.ts";
import type { TaskWithGraph } from "../services/queries.ts";
import type { KeyEvent } from "./keys.ts";
import { renderSelector, selectorLayout } from "./screens/selector.ts";
import { renderBoard, boardLayout, COLUMNS, EMPTY_BOARD } from "./screens/board.ts";
import { renderTaskDetail, historyHeight } from "./screens/task-detail.ts";
import { line, seg } from "./layout.ts";
import { header, footer } from "./chrome.ts";
import type { AppState } from "./state.ts";

/**
 * Render the current screen to a full `h`-line frame, every line exactly `w`
 * characters wide. Pure function over (state, fd) so it is easy to preview
 * and test headlessly.
 */
export function paint(
	state: AppState,
	fd: FrameData,
	w: number,
	h: number,
): string {
	const lines = renderLines(state, fd, w, h);
	const rows: string[] = [];
	for (let i = 0; i < h; i += 1) {
		const l = lines[i] ?? "";
		rows.push(l.length >= w ? l : `${l}${" ".repeat(w - l.length)}`);
	}
	return rows.join("\n");
}

function renderLines(
	state: AppState,
	fd: FrameData,
	w: number,
	h: number,
): string[] {
	if (!fd.ok) {
		return renderErrorScreen(fd.error, w, h);
	}
	switch (fd.screen) {
		case "selector":
			return renderSelector(fd.data, state, w, h);
		case "board":
			return renderBoard(fd.data, state, w, h);
		case "detail":
			return renderTaskDetail(fd.data, state, w, h);
	}
}

function renderErrorScreen(error: string, w: number, h: number): string[] {
	const lines: string[] = [];
	lines.push(...header([seg("error", chalk.red.bold)], w));
	lines.push(line([seg(`⚠ ${error}`, chalk.red)], w));
	for (let i = lines.length; i < h - 2; i += 1) lines.push("");
	lines.push(...footer([seg("q quit", chalk.dim)], w));
	return lines;
}

/**
 * Apply one keypress to the app state. Returns true when the user wants to
 * quit the TUI (the caller tears down and exits).
 */
export function handleKey(
	state: AppState,
	fd: FrameData,
	key: KeyEvent,
	_w: number,
	h: number,
): boolean {
	if (key.code === "char" && (key.input === "q" || key.input === ""))
		return true;

	switch (state.screen) {
		case "selector": {
			const projects = fd.screen === "selector" && fd.ok ? fd.data : [];
			return selectorKey(state, projects, key, h);
		}
		case "board": {
			const tasks =
				fd.screen === "board" && fd.ok ? fd.data.tasks : [];
			return boardKey(state, tasks, key, h);
		}
		case "detail": {
			const detail =
				fd.screen === "detail" && fd.ok ? fd.data : null;
			return detailKey(state, detail, key, h);
		}
	}
}

function selectorKey(
	state: AppState,
	projects: ProjectRow[],
	key: KeyEvent,
	h: number,
): boolean {
	const pIndex = Math.min(state.pIndex, Math.max(0, projects.length - 1));
	const sel = projects[pIndex];
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
				state.projectName = sel.project.name;
			} else if (state.level === 1 && sel) {
				const epic = sel.epicStats[state.eIndex]?.epic;
				if (epic) {
					state.epicId = epic.id;
					state.epicName = epic.name;
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
	tasks: TaskWithGraph[],
	key: KeyEvent,
	h: number,
): boolean {
	const columnList = (col: number) =>
		tasks.filter((t) => t.status === COLUMNS[col]);
	const cardH = boardLayout(h);

	switch (key.code) {
		case "escape":
			state.screen = "selector";
			state.level = 1;
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
			state.row = Math.min(
				Math.max(0, columnList(state.col).length - 1),
				state.row + 1,
			);
			break;
		case "pageup":
			state.row = Math.max(0, state.row - cardH);
			break;
		case "pagedown":
			state.row = Math.min(
				Math.max(0, columnList(state.col).length - 1),
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
	detail: TaskDetail | null,
	key: KeyEvent,
	h: number,
): boolean {
	const feedLen = detail?.events.length ?? 0;
	const historyLines = detail ? historyHeight(detail, h) : 10;

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
