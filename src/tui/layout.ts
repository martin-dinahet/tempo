import chalk from "chalk";
import type { ChalkInstance } from "chalk";

/** A styled segment of a line; plain strings are unstyled. */
export type Seg = string | { t: string; s: ChalkInstance };

const PALETTE: Record<string, ChalkInstance> = {
	black: chalk.black,
	red: chalk.red,
	green: chalk.green,
	yellow: chalk.yellow,
	blue: chalk.blue,
	magenta: chalk.magenta,
	cyan: chalk.cyan,
	white: chalk.white,
	gray: chalk.gray,
};

const BACKGROUNDS: Record<string, ChalkInstance> = {
	black: chalk.bgBlack,
	red: chalk.bgRed,
	green: chalk.bgGreen,
	yellow: chalk.bgYellow,
	blue: chalk.bgBlue,
	magenta: chalk.bgMagenta,
	cyan: chalk.bgCyan,
	white: chalk.bgWhite,
	gray: chalk.bgGray,
};

export function color(name: string): ChalkInstance {
	return PALETTE[name] ?? chalk.white;
}

export function background(name: string): ChalkInstance {
	return BACKGROUNDS[name] ?? chalk.bgGray;
}

export function seg(text: string, s: ChalkInstance = chalk.reset): Seg {
	return { t: text, s };
}

export function plain(item: Seg): string {
	return typeof item === "string" ? item : item.t;
}

export function plainWidth(items: readonly Seg[]): number {
	return items.reduce((n, i) => n + plain(i).length, 0);
}

/** Render a segment list to exactly `width` chars, truncating and padding. */
export function line(items: readonly Seg[], width: number): string {
	let used = 0;
	let out = "";
	for (const item of items) {
		if (used >= width) break;
		const text = plain(item);
		const slice = text.slice(0, Math.max(0, width - used));
		if (slice.length === 0) continue;
		out += typeof item === "string" ? slice : item.s(slice);
		used += slice.length;
	}
	return out + " ".repeat(Math.max(0, width - used));
}

/** Truncate a segment list to at most `width` chars, keeping styles. */
export function narrow(items: readonly Seg[], width: number): Seg[] {
	if (width <= 0) return [];
	const out: Seg[] = [];
	let used = 0;
	for (const item of items) {
		if (used >= width) break;
		const text = plain(item);
		const slice = text.slice(0, width - used);
		if (slice.length === 0) continue;
		out.push(typeof item === "string" ? slice : { t: slice, s: item.s });
		used += slice.length;
	}
	return out;
}

/** Left + right aligned within `width` (right sits at the far edge). */
export function justifySegs(
	left: readonly Seg[],
	right: readonly Seg[],
	width: number,
): Seg[] {
	const rightW = Math.min(plainWidth(right), Math.max(0, width));
	const leftW = Math.min(plainWidth(left), Math.max(0, width - rightW - 1));
	const gap = Math.max(1, width - leftW - rightW);
	return [
		...narrow(left, leftW),
		seg(" ".repeat(gap)),
		...narrow(right, rightW),
	];
}

/** Join wrapped segment lists (a "row") into one full-width styled line. */
export function row(items: readonly Seg[], width: number): string {
	return line(items, width);
}

/** A full-width horizontal rule. */
export function rule(width: number, s: ChalkInstance = chalk.dim): string {
	return s("─".repeat(width));
}

/**
 * Lay out vertical lists side by side. Each entry of `cols` is a column of
 * rows, each row a segment list. Returns full-width plain row strings where
 * each cell is already padded to its column width (ANSI-safe).
 */
export function columns(
	cols: Seg[][][],
	widths: readonly number[],
	sep?: string,
): string[] {
	const height = Math.max(0, ...cols.map((c) => c.length));
	const gap = sep ?? " ";
	const rows: string[] = [];
	for (let i = 0; i < height; i += 1) {
		const cells = cols.map((c, ci) => line(c[i] ?? [], widths[ci] ?? 0));
		rows.push(cells.join(gap));
	}
	return rows;
}
