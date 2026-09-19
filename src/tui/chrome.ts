import chalk from "chalk";
import { justifySegs, line, rule, seg } from "./layout.ts";
import type { Seg } from "./layout.ts";

export interface HeaderOpts {
	right?: Seg[];
	subtitle?: string;
	extra?: Seg[];
}

/**
 * Shared top banner: brand + live indicator, a title row (with optional
 * right-aligned content), a dim subtitle, optional extra rows, then a rule.
 */
export function header(
	title: Seg[],
	width: number,
	opts: HeaderOpts = {},
): string[] {
	const lines: string[] = [];
	lines.push(
		line(
			justifySegs(
				[seg("tempo", chalk.cyan.bold), seg(" · task tracker", chalk.dim)],
				[seg("● LIVE", chalk.green.bold)],
				width,
			),
			width,
		),
	);
	lines.push("");
	lines.push(line(justifySegs(title, opts.right ?? [], width), width));
	if (opts.subtitle !== undefined)
		lines.push(line([seg(opts.subtitle, chalk.dim)], width));
	if (opts.extra !== undefined) lines.push(line(opts.extra, width));
	lines.push(rule(width));
	return lines;
}

/** Bottom bar: a rule then key hints on the left and context on the right. */
export function footer(left: Seg[], width: number, right?: Seg[]): string[] {
	return [rule(width), line(justifySegs(left, right ?? [], width), width)];
}
