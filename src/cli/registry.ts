import type { CommandLeaf } from "./types.ts";
import { leaves as projectLeaves } from "./leaves/project.ts";
import { leaves as epicLeaves } from "./leaves/epic.ts";
import { leaves as taskLeaves } from "./leaves/task.ts";
import { leaves as eventLeaves } from "./leaves/events.ts";
import { leaves as tuiLeaves } from "./leaves/tui.ts";

export const registry = new Map<string, CommandLeaf>();
for (const leaf of [
	...projectLeaves,
	...epicLeaves,
	...taskLeaves,
	...eventLeaves,
	...tuiLeaves,
]) {
	registry.set(leaf.path, leaf);
}

export function helpText(): string {
	const lines = [
		"tempo — local-first project/epic/task tracker",
		"Usage: tempo <command> [args] [--db <path>] [--human]",
		"",
		"Commands:",
	];
	const paths = [...registry.values()]
		.sort((a, b) => a.path.localeCompare(b.path))
		.map((leaf) => `  ${leaf.usage.padEnd(62)}  ${leaf.summary}`);
	lines.push(...paths);
	lines.push(
		"",
		"Global flags: --db <sqlite path> (env TEMPO_DB), --human, --help",
	);
	return lines.join("\n");
}
