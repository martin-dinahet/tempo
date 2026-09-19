import { describe, expect, test } from "bun:test";
import {
	hasIncompleteDependency,
	wouldCreateCycle,
} from "../../src/domain/dependencies.ts";

/** Build a lookup from adjacency lists. */
function edgeLookup(edges: Array<[string, string]>): (id: string) => string[] {
	const map = new Map<string, string[]>();
	for (const [from, to] of edges) {
		const list = map.get(from) ?? [];
		list.push(to);
		map.set(from, list);
	}
	return (id: string) => map.get(id) ?? [];
}

describe("dependency cycle detection", () => {
	test("adding an edge to an empty graph is safe", () => {
		const deps = edgeLookup([]);
		expect(wouldCreateCycle("a", "b", deps)).toBe(false);
	});

	test("a self-dependency is a cycle", () => {
		const deps = edgeLookup([["a", "x"]]);
		expect(wouldCreateCycle("a", "a", deps)).toBe(true);
	});

	test("a direct 2-cycle is caught", () => {
		const edges: Array<[string, string]> = [["a", "b"]]; // a depends on b
		const deps = edgeLookup(edges);
		expect(wouldCreateCycle("b", "a", deps)).toBe(true); // b depends on a → cycle
	});

	test("a transitive cycle is caught", () => {
		const edges: Array<[string, string]> = [
			["a", "b"], // a depends on b
			["b", "c"], // b depends on c
		];
		const deps = edgeLookup(edges);
		expect(wouldCreateCycle("c", "a", deps)).toBe(true); // c depends on a → a→b→c→a
		expect(wouldCreateCycle("c", "b", deps)).toBe(true); // c depends on b → b→c→b
	});

	test("adding a downstream dependency is safe even in a deep chain", () => {
		const edges: Array<[string, string]> = [
			["a", "c"],
			["c", "d"],
		];
		const deps = edgeLookup(edges);
		expect(wouldCreateCycle("b", "d", deps)).toBe(false);
		expect(wouldCreateCycle("b", "a", deps)).toBe(false);
	});
});

describe("dependency blocking", () => {
	test("only `done` dependencies unblock", () => {
		expect(hasIncompleteDependency(["done"])).toBe(false);
		expect(hasIncompleteDependency(["done", "done"])).toBe(false);
		expect(hasIncompleteDependency(["done", "in_progress"])).toBe(true);
		expect(hasIncompleteDependency(["cancelled"])).toBe(true);
		expect(hasIncompleteDependency(["blocked"])).toBe(true);
		expect(hasIncompleteDependency([])).toBe(false);
	});
});
