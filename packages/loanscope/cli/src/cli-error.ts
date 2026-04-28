// CLI-boundary validation error.
//
// Thrown by user-facing parsers and validators in `cli-parsers/*` and
// `cli-validators.ts` so the top-level Commander handler can render a
// readable message and exit non-zero without unwinding through unrelated
// engine errors.

/** Validation error thrown at the CLI boundary with a user-friendly message. */
export class CliValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliValidationError";
  }
}
