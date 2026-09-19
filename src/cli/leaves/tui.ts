import { appError } from "../../domain/errors.ts";
import type { CommandLeaf } from "../types.ts";

/**
 * The TUI owns its own read-only database connection and blocks until the
 * user quits, so it is dispatched specially in runCli() before the shared
 * read-write DB is opened. `run` here is never reached; it exists only to
 * satisfy the CommandLeaf interface and show up in the help listing.
 */
const tuiLeaf: CommandLeaf = {
	path: "tui",
	spec: {},
	usage: "tui",
	summary: "Open the read-only live TUI",
	run: () => {
		throw appError(
			"INTERNAL_ERROR",
			"tui is dispatched before the command resolver; run() should never fire",
		);
	},
};

export const leaves: CommandLeaf[] = [tuiLeaf];
