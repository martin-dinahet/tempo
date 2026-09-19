export class AppError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "AppError";
		this.code = code;
	}

	toJSON(): { error: { code: string; message: string } } {
		return { error: { code: this.code, message: this.message } };
	}
}

export function appError(code: string, message: string): AppError {
	return new AppError(code, message);
}
