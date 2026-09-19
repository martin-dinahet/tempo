import { describe, expect, test } from "bun:test";
import type { TaskStatus } from "../../src/domain/types.ts";
import {
	ALLOWED_TRANSITIONS,
	allowedTransition,
	deriveEpicStatus,
	effectiveStatus,
	isCancellable,
	isTerminal,
} from "../../src/domain/states.ts";

describe("task state machine — allowed transitions", () => {
	test("claim is the only way into in_progress", () => {
		expect(allowedTransition("todo", "in_progress")).toBe(true);
		expect(allowedTransition("blocked", "in_progress")).toBe(false);
		expect(allowedTransition("in_review", "in_progress")).toBe(true); // reject
		expect(allowedTransition("done", "in_progress")).toBe(false);
	});

	test("submit moves in_progress to in_review only", () => {
		expect(allowedTransition("in_progress", "in_review")).toBe(true);
		expect(allowedTransition("in_progress", "done")).toBe(false);
		expect(allowedTransition("in_progress", "in_progress")).toBe(false);
	});

	test("approve moves in_review to done only", () => {
		expect(allowedTransition("in_review", "done")).toBe(true);
		expect(allowedTransition("in_review", "in_progress")).toBe(true); // reject
		expect(allowedTransition("in_review", "todo")).toBe(false);
	});

	test("terminal states have no outgoing transitions", () => {
		expect(ALLOWED_TRANSITIONS.done).toEqual([]);
		expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
		expect(isTerminal("done")).toBe(true);
		expect(isTerminal("cancelled")).toBe(true);
		expect(isTerminal("todo")).toBe(false);
	});

	test("cancel is valid from every non-terminal state", () => {
		for (const s of ["todo", "blocked", "in_progress", "in_review"]) {
			expect(isCancellable(s as never)).toBe(true);
			expect(allowedTransition(s as never, "cancelled")).toBe(true);
		}
		expect(isCancellable("done")).toBe(false);
		expect(isCancellable("cancelled")).toBe(false);
	});
});

describe("task state machine — blocked/todo is computed", () => {
	test("an unstarted task with all deps done is todo", () => {
		expect(effectiveStatus("todo", ["done"])).toBe("todo");
		expect(effectiveStatus("todo", ["done", "done"])).toBe("todo");
		expect(effectiveStatus("blocked", ["done"])).toBe("todo");
	});

	test("an unstarted task with any incomplete dep is blocked", () => {
		expect(effectiveStatus("todo", ["in_progress"])).toBe("blocked");
		expect(effectiveStatus("todo", ["done", "todo"])).toBe("blocked");
		expect(effectiveStatus("blocked", ["done", "in_progress"])).toBe("blocked");
	});

	test("a cancelled dependency still counts as not done", () => {
		expect(effectiveStatus("todo", ["cancelled"])).toBe("blocked");
		expect(effectiveStatus("blocked", ["done", "cancelled"])).toBe("blocked");
	});

	test("started tasks pass through untouched", () => {
		for (const s of [
			"in_progress",
			"in_review",
			"done",
			"cancelled",
		] as TaskStatus[]) {
			expect(effectiveStatus(s, ["done"] as TaskStatus[])).toBe(s);
			expect(effectiveStatus(s, ["in_progress"] as TaskStatus[])).toBe(s);
		}
	});
});

describe("epic status derivation", () => {
	test("empty epic", () => {
		expect(deriveEpicStatus([])).toBe("empty");
	});

	test("not_started when everything is todo/blocked", () => {
		expect(deriveEpicStatus(["todo", "blocked"] as TaskStatus[])).toBe(
			"not_started",
		);
	});

	test("in_progress when anything is in_progress or in_review", () => {
		expect(deriveEpicStatus(["todo", "in_progress"] as TaskStatus[])).toBe(
			"in_progress",
		);
		expect(
			deriveEpicStatus(["blocked", "in_review", "done"] as TaskStatus[]),
		).toBe("in_progress");
	});

	test("done when everything is done or cancelled", () => {
		expect(deriveEpicStatus(["done", "cancelled"] as TaskStatus[])).toBe(
			"done",
		);
	});
});
