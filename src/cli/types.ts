import type { CommandContext } from "../context.ts";
import type { ArgKind, ParsedArgs } from "./args.ts";

export interface CommandLeaf {
	/** Space-separated command path, e.g. `task claim`. */
	path: string;
	/** Flag spec for --flag parsing. */
	spec: Record<string, ArgKind>;
	run: (ctx: CommandContext, parsed: ParsedArgs) => unknown;
	/** Optional `--human` rendering. Falls back to JSON. */
	human?: (data: unknown, ctx: CommandContext) => string;
	/** Short usage line for help output. */
	usage: string;
	summary: string;
}
