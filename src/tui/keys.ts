/** Minimal keypress decoder for a raw-mode stdin byte stream. */

export type KeyCode =
	| "up"
	| "down"
	| "left"
	| "right"
	| "pageup"
	| "pagedown"
	| "tab"
	| "enter"
	| "escape"
	| "char";

export interface KeyEvent {
	/** The typed character, or "" for control / navigation keys. */
	input: string;
	code: KeyCode;
	shift: boolean;
}

export function key(code: KeyCode, input = "", shift = false): KeyEvent {
	return { input, code, shift };
}

interface Parsed {
	parsed: KeyEvent;
	rest: string;
}

function isCsiFinal(code: number): boolean {
	return code >= 0x40 && code <= 0x7e;
}

/** Decode one CSI sequence body (without the leading ESC), e.g. `[A`. */
function parseCsi(tok: string): KeyEvent | null {
	const fin = tok[tok.length - 1];
	if (fin === undefined) return null;
	const params = tok.slice(1, -1).split(";");
	let code: KeyCode;
	switch (fin) {
		case "A":
			code = "up";
			break;
		case "B":
			code = "down";
			break;
		case "C":
			code = "right";
			break;
		case "D":
			code = "left";
			break;
		case "Z":
			code = "tab";
			break;
		case "~":
			code =
				params[0] === "5" ? "pageup" : params[0] === "6" ? "pagedown" : "char";
			break;
		default:
			return null;
	}
	const shift = params.some((p) => p === "2" || p === "4");
	return key(code, "", shift);
}

/**
 * Try to decode one keypress from the head of `buffer`. Returns null when the
 * buffer is an incomplete escape sequence awaiting more bytes.
 */
export function parseKeyToken(buffer: string): Parsed | null {
	if (buffer.length === 0) return null;
	const c = buffer.charCodeAt(0) as number;

	if (c === 27) {
		// ESC alone: could be the start of a longer sequence, wait briefly.
		if (buffer.length < 2) return null;
		const n1 = buffer[1] as string;
		if (n1 === "\x1b") {
			// Two ESC bytes: one escape key, leave the second for later.
			return { parsed: key("escape"), rest: buffer.slice(1) };
		}
		if (n1 === "[" || n1 === "O") {
			for (let i = 2; i < buffer.length; i += 1) {
				if (isCsiFinal(buffer.charCodeAt(i) as number)) {
					const tok = buffer.slice(1, i + 1);
					return {
						parsed: parseCsi(tok) ?? key("escape"),
						rest: buffer.slice(i + 1),
					};
				}
			}
			return null;
		}
		// ESC followed by an unrelated char (e.g. alt+key): treat as escape.
		return { parsed: key("escape"), rest: buffer.slice(1) };
	}

	if (c === 9) return { parsed: key("tab"), rest: buffer.slice(1) };
	if (c === 13 || c === 10)
		return { parsed: key("enter"), rest: buffer.slice(1) };

	return { parsed: key("char", buffer[0]!), rest: buffer.slice(1) };
}
