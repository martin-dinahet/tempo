import type { CommandContext } from "../context.ts";
import { getTaskDetail } from "../services/queries.ts";
import type { TaskDetail } from "../services/queries.ts";
import { loadProjects } from "./screens/selector.ts";
import type { ProjectRow } from "./screens/selector.ts";
import { loadBoard } from "./screens/board.ts";
import type { BoardData } from "./screens/board.ts";
import type { AppState } from "./state.ts";

export type { ProjectRow, BoardData, TaskDetail };

export type FrameData =
	| { screen: "selector"; ok: true; data: ProjectRow[] }
	| { screen: "selector"; ok: false; error: string }
	| { screen: "board"; ok: true; data: BoardData }
	| { screen: "board"; ok: false; error: string }
	| { screen: "detail"; ok: true; data: TaskDetail }
	| { screen: "detail"; ok: false; error: string };

export function loadFrameData(state: AppState, ctx: CommandContext): FrameData {
	switch (state.screen) {
		case "selector":
			try {
				return { screen: "selector", ok: true, data: loadProjects(ctx) };
			} catch (e) {
				return { screen: "selector", ok: false, error: String(e) };
			}
		case "board":
			try {
				return { screen: "board", ok: true, data: loadBoard(ctx, state.epicId) };
			} catch (e) {
				return { screen: "board", ok: false, error: String(e) };
			}
		case "detail":
			try {
				if (!state.taskId) throw new Error("no task selected");
				return {
					screen: "detail",
					ok: true,
					data: getTaskDetail(ctx, state.taskId),
				};
			} catch (e) {
				return { screen: "detail", ok: false, error: String(e) };
			}
	}
}
