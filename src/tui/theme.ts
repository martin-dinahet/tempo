import type { AppEvent } from "../domain/types.ts";

/** Foreground color for each task status, kept in sync with the CLI. */
export const STATUS_COLORS: Record<string, string> = {
	blocked: "red",
	todo: "blue",
	in_progress: "yellow",
	in_review: "magenta",
	done: "green",
	cancelled: "gray",
};

/** A short, human hint shown under each kanban column header. */
export const STATUS_GUIDES: Record<string, string> = {
	blocked: "waiting on deps",
	todo: "ready to pick up",
	in_progress: "being worked",
	in_review: "awaiting review",
	done: "complete",
	cancelled: "dropped",
};

/** Compact glyph drawn before each task card name. */
export const STATUS_GLYPHS: Record<string, string> = {
	blocked: "⊘",
	todo: "○",
	in_progress: "◐",
	in_review: "◎",
	done: "✓",
	cancelled: "✕",
};

/** Short human label used in dense count chips. */
export function shortLabel(status: string): string {
	switch (status) {
		case "in_progress":
			return "doing";
		case "in_review":
			return "review";
		default:
			return status;
	}
}

/** A reusable colored status pill like `[done]`. */
export function statusBadge(status: string): string {
	return ` ${status} `;
}

export function ellipsize(text: string, max: number): string {
	if (text.length <= max) return text;
	if (max <= 1) return text.slice(0, max);
	return `${text.slice(0, max - 1)}…`;
}

export function shortId(id: string): string {
	return id.slice(0, 8);
}

/** `HH:MM:SS` from an ISO timestamp. */
export function formatTime(iso: string): string {
	return iso.length >= 19 ? iso.slice(11, 19) : iso;
}

/** `HH:MM` from an ISO timestamp. */
export function formatClock(iso: string): string {
	return iso.length >= 16 ? iso.slice(11, 16) : iso;
}

/** `YYYY-MM-DD` from an ISO timestamp. */
export function formatDate(iso: string): string {
	return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

export function progressBar(pct: number, width: number): string {
	const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width);
	return (
		"█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, width - filled))
	);
}

export interface EventLine {
	label: string;
	color: string;
	subject: string;
	suffix: string;
}

const EVENT_CHARTS: Record<
	string,
	{ label: string; color: string; subjectIsName?: boolean }
> = {
	"task.created": { label: "created", color: "cyan", subjectIsName: true },
	"task.updated": { label: "updated", color: "blue", subjectIsName: true },
	"task.claimed": { label: "claimed", color: "yellow" },
	"task.released": { label: "released", color: "yellow" },
	"task.submitted": { label: "submitted", color: "magenta" },
	"task.approved": { label: "approved", color: "green" },
	"task.completed": { label: "completed", color: "green" },
	"task.rejected": { label: "rejected", color: "red" },
	"task.cancelled": { label: "cancelled", color: "gray" },
	"task.blocked": { label: "blocked", color: "red" },
	"task.unblocked": { label: "unblocked", color: "green" },
	"task.depend_added": { label: "dep added", color: "cyan" },
	"task.depend_removed": { label: "dep removed", color: "gray" },
};

/**
 * Turn an audit event into a short, human-readable sentence fragment:
 * `created "Write spec"`. `resolveName` maps an entity/task id back to a name.
 */
export function formatEvent(
	event: AppEvent,
	resolveName: (id: string) => string,
): EventLine {
	const chart = EVENT_CHARTS[event.event_type] ?? {
		label: event.event_type,
		color: "gray",
	};
	let suffix = "";
	if (event.event_type === "task.submitted" && event.payload.reviewer) {
		suffix = `→ @${String(event.payload.reviewer)}`;
	}
	if (
		(event.event_type === "task.rejected" ||
			event.event_type === "task.cancelled") &&
		typeof event.payload.reason === "string"
	) {
		suffix = `· ${event.payload.reason}`;
	}
	if (
		(event.event_type === "task.depend_added" ||
			event.event_type === "task.depend_removed") &&
		typeof event.payload.depends_on === "string"
	) {
		const arrow = event.event_type === "task.depend_added" ? "→" : "←";
		suffix = `${arrow} ${resolveName(String(event.payload.depends_on))}`;
	}

	const subject =
		typeof event.payload.name === "string"
			? `"${String(event.payload.name)}"`
			: `"${resolveName(event.entity_id) || "?"}"`;

	return { label: chart.label, color: chart.color, subject, suffix };
}
