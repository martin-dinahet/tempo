import type { Database } from "bun:sqlite";
import { createContext, type CommandContext } from "../src/context.ts";
import { openDb } from "../src/repositories/sqlite.ts";
import type { AppError } from "../src/domain/errors.ts";

/** A fresh in-memory context with a controllable clock for deterministic tests. */
export function makeTestContext(): {
	ctx: CommandContext;
	clock: { now(): string; advance(ms: number): void };
} {
	const db: Database = openDb(":memory:");
	let base = Date.UTC(2026, 0, 1);
	const clock = {
		now: () => new Date(base).toISOString(),
		advance: (ms: number) => {
			base += ms;
		},
	};
	const ctx = createContext(db, () => clock.now(), "human");
	return { ctx, clock };
}

/** Assert that fn throws an AppError (or error with a `code`) with the given code. */
export function expectError(fn: () => unknown, code: string): void {
	try {
		fn();
	} catch (err) {
		const e = err as AppError;
		if (typeof e?.code === "string" && e.code === code) return;
		throw new Error(
			`expected error code ${code}, got ${JSON.stringify((err as Error)?.message ?? err)}`,
		);
	}
	throw new Error(`expected error code ${code}, but no error was thrown`);
}
