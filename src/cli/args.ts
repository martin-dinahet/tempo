import { z } from "zod";
import { appError } from "../domain/errors.ts";

export type ArgKind = "boolean" | "value" | "values";

export interface ParsedArgs {
	positional: string[];
	options: Record<string, string | string[] | boolean>;
}

/**
 * Parse CLI argv against a spec describing each `--flag`:
 *  - `boolean`: presence flag, no value (`--human`)
 *  - `value`:   single value, next token (`--name Foo`), last one wins
 *  - `values`:  repeatable single values (`--depends-on a --depends-on b`)
 */
export function parseArgs(
	argv: readonly string[],
	spec: Record<string, ArgKind>,
): ParsedArgs {
	const positional: string[] = [];
	const options: ParsedArgs["options"] = {};

	let i = 0;
	while (i < argv.length) {
		const token = argv[i]!;
		if (token === "--") {
			positional.push(...argv.slice(i + 1));
			break;
		}
		if (token.length >= 2 && token.startsWith("--")) {
			const name = token.slice(2);
			const kind = spec[name] ?? "boolean";
			if (kind === "boolean") {
				options[name] = true;
				i += 1;
				continue;
			}
			const value = argv[i + 1];
			if (
				value === undefined ||
				(value.length >= 2 && value.startsWith("--"))
			) {
				throw appError("MISSING_ARGUMENT", `flag --${name} requires a value`);
			}
			if (kind === "value") {
				options[name] = value;
			} else {
				const existing = (options[name] as string[] | undefined) ?? [];
				existing.push(value);
				options[name] = existing;
			}
			i += 2;
			continue;
		}
		positional.push(token);
		i += 1;
	}

	return { positional, options };
}

/** Pick a single value option, with a convenient default. */
export function optStr(parsed: ParsedArgs, name: string): string | undefined {
	const v = parsed.options[name];
	return typeof v === "string" ? v : undefined;
}

/** Pick a boolean option. */
export function optBool(parsed: ParsedArgs, name: string): boolean {
	return parsed.options[name] === true;
}

/** Pick a repeatable / comma-separated values option. */
export function optList(parsed: ParsedArgs, name: string): string[] {
	const v = parsed.options[name];
	if (v === undefined || typeof v === "boolean") return [];
	const list = Array.isArray(v) ? v : [v];
	return list
		.flatMap((entry) => entry.split(","))
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Pick a single positional argument or throw. */
export function optPositional(
	parsed: ParsedArgs,
	index: number,
	label: string,
): string {
	const value = parsed.positional[index];
	if (value === undefined)
		throw appError("MISSING_ARGUMENT", `missing required argument: ${label}`);
	return value;
}

/** Pick an optional positional argument. */
export function optPositionalOpt(
	parsed: ParsedArgs,
	index: number,
): string | undefined {
	return parsed.positional[index];
}

/** Parse & validate an int option such as `--limit`. */
export function optInt(parsed: ParsedArgs, name: string): number | undefined {
	const v = optStr(parsed, name);
	if (v === undefined) return undefined;
	const n = Number(v);
	if (!Number.isInteger(n) || n <= 0) {
		throw appError(
			"INVALID_ARGUMENT",
			`flag --${name} must be a positive integer, got '${v}'`,
		);
	}
	return n;
}

export { z };

/** Re-exported so command files can validate with the same zod instance. */
export function schemaIssues(error: z.ZodError): string {
	return error.issues.map((i) => i.message).join("; ");
}
