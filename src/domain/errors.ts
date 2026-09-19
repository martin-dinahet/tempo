export class AppError extends Error {
	readonly code: string;
	/** Optional next step for the caller (rendered as `error.hint`). */
	readonly hint: string | undefined;

	constructor(code: string, message: string, hint?: string) {
		super(message);
		this.name = "AppError";
		this.code = code;
		this.hint = hint;
	}

	toJSON(): { error: { code: string; message: string; hint?: string } } {
		return {
			error: {
				code: this.code,
				message: this.message,
				...(this.hint === undefined ? {} : { hint: this.hint }),
			},
		};
	}
}

export function appError(
	code: string,
	message: string,
	hint?: string,
): AppError {
	return new AppError(code, message, hint);
}

interface Issue {
	path: readonly PropertyKey[];
	message: string;
	code?: string;
	origin?: string;
	minimum?: unknown;
}

/**
 * Turn zod issues into one message that names the offending field, e.g.
 * `'epic' is required; 'name': Invalid input`. Zod's own text for an empty
 * string ("Too small: expected string to have >=1 characters") never says
 * which field was empty.
 */
export function describeIssues(error: { issues: readonly Issue[] }): string {
	return error.issues
		.map((issue) => {
			const field = issue.path.map(String).join(".");
			const required =
				issue.code === "too_small" &&
				issue.origin === "string" &&
				issue.minimum === 1;
			if (!field) return issue.message;
			return required
				? `'${field}' is required`
				: `'${field}': ${issue.message}`;
		})
		.join("; ");
}
