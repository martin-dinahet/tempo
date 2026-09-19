import type { EventRepository } from "../repositories/types.ts";

/**
 * `--human` rendering helpers. The default output is always JSON; these are
 * only for people debugging by hand. Each command supplies its own formatter;
 * everything else falls back to JSON.stringify.
 */

function cells(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function table(rows: Array<Record<string, unknown>>): string {
	if (rows.length === 0) return "(none)";
	const headers = Object.keys(rows[0]!);
	const widths = headers.map((h) =>
		Math.max(h.length, ...rows.map((r) => cells(r[h]).length)),
	);
	const line = (values: string[]) =>
		values
			.map((v, i) => v.padEnd(widths[i]!))
			.join("  ")
			.trimEnd();
	const header = line(headers);
	const sep = "─".repeat(Math.max(header.length, 1));
	const body = rows.map((r) => line(headers.map((h) => cells(r[h]))));
	return [header, sep, ...body].join("\n");
}

export function kv(obj: object, order?: string[]): string {
	const record = obj as Record<string, unknown>;
	const keys = order ?? Object.keys(record);
	const lines = keys
		.filter((k) => k in record)
		.map((k) => `${k}: ${cells(record[k])}`);
	return lines.join("\n");
}

export function listSection(title: string, rows: unknown[]): string {
	if (rows.length === 0) return `${title}: (none)`;
	return `${title}:\n${table(rows.map((r) => r as Record<string, unknown>))}`;
}

export function eventList(
	events: ReturnType<EventRepository["listByEpic"]>,
): string {
	if (events.length === 0) return "(no events)";
	return events
		.map((e) => {
			const payload = Object.keys(e.payload).length
				? ` ${JSON.stringify(e.payload)}`
				: "";
			return `${e.created_at}  [${e.actor}]  ${e.event_type}  ${e.entity_id}${payload}`;
		})
		.join("\n");
}

export function durations(value: unknown): string {
	return cells(value);
}
