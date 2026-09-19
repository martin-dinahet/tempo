import type { TaskStatus } from "./types.ts";

/**
 * Finish-to-start dependency graph over tasks.
 *
 * Edges point from a dependent task to the task it depends on:
 *   dependent taskId ──depends_on──▶ dependency id
 */

/**
 * Returns true if adding the edge `currentNode -> proposedDep` would create a
 * cycle, i.e. if `proposedDep` can already reach `currentNode` by following
 * existing dependency edges.
 *
 * `dependenciesOf(id)` must return the ids of the tasks that `id` depends on.
 */
export function wouldCreateCycle(
	currentNode: string,
	proposedDep: string,
	dependenciesOf: (id: string) => readonly string[],
): boolean {
	if (currentNode === proposedDep) return true;
	const stack: string[] = [...dependenciesOf(proposedDep)];
	const seen = new Set<string>();
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node === currentNode) return true;
		if (seen.has(node)) continue;
		seen.add(node);
		for (const dep of dependenciesOf(node)) stack.push(dep);
	}
	return false;
}

/** A dependency blocks its dependent until it is `done`. */
export function hasIncompleteDependency(
	dependencyStatuses: readonly TaskStatus[],
): boolean {
	return dependencyStatuses.some((s) => s !== "done");
}
