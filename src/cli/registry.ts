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

/**
 * Help text. With `scope` set to a command path (`task claim`) it shows just
 * that command; set to a group (`task`) it lists that group's commands.
 */
export function helpText(scope?: string): string {
	const single = scope ? registry.get(scope) : undefined;
	if (single) {
		return [`Usage: tempo ${single.usage}`, single.summary].join("\n");
	}
	const leaves = [...registry.values()]
		.filter((leaf) => !scope || leaf.path.startsWith(`${scope} `))
		.sort((a, b) => a.path.localeCompare(b.path));
	const shown = leaves.length > 0 ? leaves : [...registry.values()];
	const lines = [
		"tempo — local-first project/epic/task tracker",
		"Usage: tempo <command> [args] [--db <path>] [--human]",
		"",
		"Commands:",
		...shown.map((leaf) => `  ${leaf.usage.padEnd(62)}  ${leaf.summary}`),
		"",
		"Global flags: --db <sqlite path> (env TEMPO_DB), --human, --help",
		"Identity: set TEMPO_AGENT=<agentId> to default --agent / --as",
		"Ids: any unambiguous prefix (4+ characters) works in place of a full id",
	];
	return lines.join("\n");
}
