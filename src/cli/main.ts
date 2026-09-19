import type { Database } from "bun:sqlite";
import { defaultDbPath } from "../dbpath.ts";
import { createContext } from "../context.ts";
import { appError } from "../domain/errors.ts";
import { openDb } from "../repositories/sqlite.ts";
import { startTui } from "../tui/run.ts";
import { parseArgs } from "./args.ts";
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

export interface CliRunResult {
	data?: unknown;
	error?: { code: string; message: string };
	exitCode: number;
	output?: string;
}

export function toErrorJson(err: unknown): { code: string; message: string } {
	if (
		err instanceof Error &&
		"code" in err &&
		typeof (err as { code: unknown }).code === "string"
	) {
		return { code: (err as { code: string }).code, message: err.message };
	}
	if (err && typeof err === "object" && "issues" in err) {
		return {
			code: "INVALID_ARGUMENT",
			message: String(
				(err as { issues: Array<{ message: string }> }).issues
					.map((i) => i.message)
					.join("; "),
			),
		};
	}
	if (err instanceof Error)
		return { code: "INTERNAL_ERROR", message: err.message };
	return { code: "INTERNAL_ERROR", message: String(err) };
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
	if (global.help || global.commands.length === 0) {
		console.log(helpText());
		return { exitCode: 0 };
	}

	const path =
		registeredPath(global.commands) ?? global.commands.slice(0, 2).join(" ");
	const leaf = registry.get(path);
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

	const ctx = createContext(db);
	try {
		const parsed = parseArgs(
			global.commands.slice(path.split(" ").length),
			leaf.spec,
		);
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

export interface CliRunResult {
	data?: unknown;
	error?: { code: string; message: string };
	exitCode: number;
	output?: string;
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
