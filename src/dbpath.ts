import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the default database location: a single user-wide file so you can
 * keep one Project per repo. Honors $XDG_DATA_HOME on Linux, and uses the
 * platform's data directory otherwise:
 *   Linux   ~/.local/share/tempo/tempo.db
 *   macOS   ~/Library/Application Support/tempo/tempo.db
 *   Windows %APPDATA%\tempo\tempo.db
 */
export function defaultDbPath(): string {
	const home = homedir();
	let dir: string;
	if (process.env.XDG_DATA_HOME) {
		dir = join(process.env.XDG_DATA_HOME, "tempo");
	} else if (process.platform === "darwin") {
		dir = join(home, "Library", "Application Support", "tempo");
	} else if (process.platform === "win32") {
		dir = join(process.env.APPDATA ?? home, "tempo");
	} else {
		dir = join(home, ".local", "share", "tempo");
	}
	return join(dir, "tempo.db");
}
