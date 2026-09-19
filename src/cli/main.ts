import type { Database } from "bun:sqlite";
import { defaultDbPath } from "../dbpath.ts";
import { createContext } from "../context.ts";
import { appError, describeIssues } from "../domain/errors.ts";
import { openDb } from "../repositories/sqlite.ts";
import { startTui } from "../tui/run.ts";
import { envAgent, parseArgs } from "./args.ts";
import { HINTS } from "./hints.ts";
import { resolveIds } from "./ids.ts";
import { helpText, registry } from "./registry.ts";

export interface GlobalOptions {
	dbPath: string;
	human: boolean;
	help: boolean;
	commands: string[];
}

export function parseGlobalOptions(argv: readonly string[]): GlobalOptions {
	let dbPath = process.env.TEMPO_DB ?? defaultDbPath();
	let human = false;
	let help = false;
	const commands: string[] = [];
	let i = 0;
	while (i < argv.length) {
		const token = argv[i]!;
		if (token === "--human") {
			human = true;
		} else if (token === "--help" || token === "-h") {
			help = true;
		} else if (token === "--db") {
			const value = argv[i + 1];
			if (value === undefined)
				throw appError("MISSING_ARGUMENT", "flag --db requires a value");
			dbPath = value;
			i += 1;
		} else {
			commands.push(token);
		}
		i += 1;
	}
	return { dbPath, human, help, commands };
}

export interface CliError {
	code: string;
	message: string;
	hint?: string;
}

export interface CliRunResult {
	data?: unknown;
	error?: CliError;
	exitCode: number;
	output?: string;
}

function withHint(error: CliError, hint?: string): CliError {
	const text = hint ?? HINTS[error.code];
	return text === undefined ? error : { ...error, hint: text };
}

export function toErrorJson(err: unknown): CliError {
	if (
		err instanceof Error &&
		"code" in err &&
		typeof (err as { code: unknown }).code === "string"
	) {
		return withHint(
			{ code: (err as { code: string }).code, message: err.message },
			(err as { hint?: string }).hint,
		);
	}
	if (err && typeof err === "object" && "issues" in err) {
		return withHint({
			code: "INVALID_ARGUMENT",
			message: describeIssues(err as { issues: never[] }),
		});
	}
	if (err instanceof Error)
		return { code: "INTERNAL_ERROR", message: err.message };
	return { code: "INTERNAL_ERROR", message: String(err) };
}

function hasGroup(name: string): boolean {
	return [...registry.keys()].some((path) => path.startsWith(`${name} `));
}

function registeredPath(commands: string[]): string | null {
	for (let n = commands.length; n >= 1; n -= 1) {
		const candidate = commands.slice(0, n).join(" ");
		if (registry.has(candidate)) return candidate;
	}
	return null;
}

export function runCli(argv: readonly string[]): CliRunResult {
	const global = parseGlobalOptions(argv);
	const path =
		registeredPath(global.commands) ?? global.commands.slice(0, 2).join(" ");
	const leaf = registry.get(path);
	if (global.help || global.commands.length === 0) {
		console.log(helpText(leaf?.path ?? global.commands[0]));
		return { exitCode: 0 };
	}
	// A bare group name such as `tempo task` lists that group's commands.
	if (!leaf && global.commands.length === 1 && hasGroup(global.commands[0]!)) {
		console.log(helpText(global.commands[0]));
		return { exitCode: 0 };
	}
	if (!leaf) {
		return {
			error: {
				code: "UNKNOWN_COMMAND",
				message: `unknown command: ${global.commands.join(" ")}`,
			},
			exitCode: 1,
		};
	}

	// The TUI opens its own read-only connection and blocks until quit, so it
	// is launched before the shared read-write DB (which would otherwise
	// create a file that must already exist for the viewer).
	if (leaf.path === "tui") {
		return { exitCode: startTui(global.dbPath) };
	}

	let db: Database;
	try {
		db = openDb(global.dbPath);
	} catch (err) {
		return { error: toErrorJson(err), exitCode: 1 };
	}

	const ctx = createContext(db, undefined, envAgent() ?? "human");
	try {
		const parsed = parseArgs(
			global.commands.slice(path.split(" ").length),
			leaf.spec,
		);
		resolveIds(ctx, leaf.ids, parsed);
		const data = leaf.run(ctx, parsed);
		const text =
			global.human && leaf.human
				? leaf.human(data, ctx)
				: JSON.stringify(data, null, 2);
		return { data, exitCode: 0, output: text };
	} catch (err) {
		return { error: toErrorJson(err), exitCode: 1 };
	} finally {
		db.close();
	}
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
	let result: CliRunResult;
	try {
		result = runCli(argv);
	} catch (err) {
		console.error(JSON.stringify({ error: toErrorJson(err) }));
		return 1;
	}
	if (result.output !== undefined) console.log(result.output);
	if (result.error) console.error(JSON.stringify({ error: result.error }));
	return result.exitCode;
}
