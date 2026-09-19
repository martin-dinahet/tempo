import { existsSync } from "node:fs";
import { createContext } from "../context.ts";
import { openDb } from "../repositories/sqlite.ts";
import { handleKey, paint } from "./app.ts";
import { loadFrameData } from "./frame.ts";
import type { FrameData } from "./frame.ts";
import { initialAppState } from "./state.ts";
import { key, parseKeyToken } from "./keys.ts";

/** Enter the alternate screen buffer, clear it, and hide the cursor. */
const ENTER_FULLSCREEN = "[?1049h[2J[H[?25l";
/** Show the cursor and return to the primary screen buffer. */
const EXIT_FULLSCREEN = "[?25h[?1049l";
/** Poll the database this often (ms); the TUI is read-only and live. */
const POLL_MS = 750;

/**
 * Launch the read-only TUI against `dbPath`. Returns 1 (synchronously) if
 * the database file does not exist. Otherwise it wires up the input / resize
 * / poll handlers and returns 0; the process then stays alive in the TUI
 * until the user quits, at which point the terminal is restored and the
 * event loop drains with the exit code already set by the caller.
 */
export function startTui(dbPath: string): number {
	if (!existsSync(dbPath)) {
		console.error(`database not found: ${dbPath}`);
		console.error("create one first, e.g.  tempo project create --name Demo");
		return 1;
	}

	const db = openDb(dbPath, { readonly: true });
	const ctx = createContext(db);

	const out = process.stdout;
	const stdin = process.stdin;
	const isTTY = Boolean(out.isTTY);
	const state = initialAppState();

	let w = out.columns ?? 80;
	let h = out.rows ?? 24;
	let last = "";
	let quit = false;
	let buffer = "";
	let escTimer: ReturnType<typeof setTimeout> | null = null;
	let poll: ReturnType<typeof setInterval>;

	// Most recent frame data — key handlers use it for bounds without a DB re-read.
	let frameData: FrameData = loadFrameData(state, ctx);

	const paintFrame = () => {
		if (quit) return;
		frameData = loadFrameData(state, ctx);
		const frame = paint(state, frameData, w, h);
		if (frame !== last) {
			last = frame;
			out.write("[H" + frame);
		}
	};

	const onResize = () => {
		w = out.columns ?? w;
		h = out.rows ?? h;
		paintFrame();
	};

	const doQuit = () => {
		cleanup();
	};

	const onData = (data: Buffer | string) => {
		buffer += data.toString();
		while (buffer.length > 0 && !quit) {
			const parsed = parseKeyToken(buffer);
			if (!parsed) break;
			buffer = parsed.rest;
			if (escTimer) {
				clearTimeout(escTimer);
				escTimer = null;
			}
			// Use last frame's data for bounds checking in the key handler, then
			// reload after state mutation so the render reflects any screen change.
			if (handleKey(state, frameData, parsed.parsed, w, h)) {
				doQuit();
				return;
			}
			paintFrame();
		}
		if (!quit && buffer === "" && !escTimer) {
			// A lone ESC needs a moment to tell "Escape" apart from the start
			// of an arrow-key sequence.
			escTimer = setTimeout(() => {
				escTimer = null;
				if (quit || buffer !== "") return;
				buffer = "";
				if (handleKey(state, frameData, key("escape"), w, h)) doQuit();
				else paintFrame();
			}, 45);
		}
	};

	const onSignal = () => {
		cleanup();
		process.exit(130);
	};

	function cleanup(): void {
		quit = true;
		out.removeListener("resize", onResize);
		stdin.removeListener("data", onData);
		process.removeListener("SIGINT", onSignal);
		process.removeListener("SIGTERM", onSignal);
		clearInterval(poll);
		if (escTimer) clearTimeout(escTimer);
		if (stdin.isTTY) stdin.setRawMode(false);
		stdin.pause();
		if (isTTY) out.write(EXIT_FULLSCREEN);
	}

	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);
	out.on("resize", onResize);
	stdin.on("data", onData);
	if (stdin.isTTY) stdin.setRawMode(true);
	stdin.resume();

	if (isTTY) out.write(ENTER_FULLSCREEN);
	poll = setInterval(paintFrame, POLL_MS);
	paintFrame();

	return 0;
}
