import type { CommandContext } from "../context.ts";
import type { ArgKind, ParsedArgs } from "./args.ts";

export type IdKind = "project" | "epic" | "task";

/** Which arguments hold ids, so unambiguous prefixes can be expanded. */
export interface IdArgs {
	/** Kind of the first positional argument. */
	positional?: IdKind;
	/** Kind of the value(s) of each named flag. */
	flags?: Record<string, IdKind>;
}

export interface CommandLeaf {
	/** Space-separated command path, e.g. `task claim`. */
	path: string;
	/** Flag spec for --flag parsing. */
	spec: Record<string, ArgKind>;
	run: (ctx: CommandContext, parsed: ParsedArgs) => unknown;
	/** Optional `--human` rendering. Falls back to JSON. */
	human?: (data: unknown, ctx: CommandContext) => string;
	/** Arguments that hold ids (enables short-id prefixes). */
	ids?: IdArgs;
	/** Short usage line for help output. */
	usage: string;
	summary: string;
}
