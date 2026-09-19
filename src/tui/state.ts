/** Mutable navigation + screen state shared by the render and input paths. */
export interface AppState {
	screen: "selector" | "board" | "detail";
	/** Currently open project (used for selector breadcrumbs). */
	projectId: string | null;
	/** Currently open epic (board). */
	epicId: string | null;
	/** Currently open task (detail). */
	taskId: string | null;
	/** Human-readable names for breadcrumb display in task detail. */
	projectName: string | null;
	epicName: string | null;
	/** Selector depth: 0 = projects, 1 = epics in the selected project. */
	level: 0 | 1;
	pIndex: number;
	eIndex: number;
	scrollP: number;
	scrollE: number;
	/** Board: focused status column and task row within it. */
	col: number;
	row: number;
	/** Detail: event history scroll offset. */
	dscroll: number;
}

export function initialAppState(): AppState {
	return {
		screen: "selector",
		projectId: null,
		epicId: null,
		taskId: null,
		projectName: null,
		epicName: null,
		level: 0,
		pIndex: 0,
		eIndex: 0,
		scrollP: 0,
		scrollE: 0,
		col: 0,
		row: 0,
		dscroll: 0,
	};
}
