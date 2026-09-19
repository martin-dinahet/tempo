import type { CommandContext } from "../context.ts";
import { appError } from "../domain/errors.ts";
import type { ParsedArgs } from "./args.ts";
import type { IdArgs, IdKind } from "./types.ts";

const MIN_PREFIX = 4;

const LABELS: Record<IdKind, string> = {
	project: "projects",
	epic: "epics",
	task: "tasks",
};

/**
 * Expand a short id prefix (as shown by the TUI) to the full id. Exact ids
 * pass through untouched, and so do values that match nothing, so the command
 * itself reports the usual `*_NOT_FOUND` error. An ambiguous prefix is an error.
 */
export function resolveId(
	ctx: CommandContext,
	kind: IdKind,
	value: string,
): string {
	const repo = kind === "project" ? ctx.projects : kind === "epic" ? ctx.epics : ctx.tasks;
	if (repo.findById(value)) return value;
	if (value.length < MIN_PREFIX) return value;
	const matches = repo.findIdsByPrefix(value.toLowerCase());
	if (matches.length === 1) return matches[0]!;
	if (matches.length > 1) {
		throw appError(
			"AMBIGUOUS_ID",
			`'${value}' matches ${LABELS[kind]}: ${matches.join(", ")}`,
			"Use more characters of the id.",
		);
	}
	return value;
}

/** Expand id prefixes in `parsed` in place, per the leaf's `ids` metadata. */
export function resolveIds(
	ctx: CommandContext,
	ids: IdArgs | undefined,
	parsed: ParsedArgs,
): void {
	if (!ids) return;
	if (ids.positional && parsed.positional[0] !== undefined) {
		parsed.positional[0] = resolveId(ctx, ids.positional, parsed.positional[0]);
	}
	for (const [flag, kind] of Object.entries(ids.flags ?? {})) {
		const value = parsed.options[flag];
		if (typeof value === "string") {
			parsed.options[flag] = resolveId(ctx, kind, value);
		} else if (Array.isArray(value)) {
			// `values` flags may also hold comma-separated lists.
			parsed.options[flag] = value.map((entry) =>
				entry
					.split(",")
					.map((part) => resolveId(ctx, kind, part.trim()))
					.join(","),
			);
		}
	}
}
