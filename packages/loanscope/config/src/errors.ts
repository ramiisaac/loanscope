import type { z } from "zod";

/** Single structured validation issue with path context. */
export interface ConfigValidationIssue {
  path: string;
  message: string;
  code?: string;
}

/** Structured config validation error with path context and individual issues. */
export class ConfigValidationError extends Error {
  readonly path: string;
  readonly details: string;
  readonly issues: readonly ConfigValidationIssue[];

  constructor(path: string, details: string, issues?: ConfigValidationIssue[]) {
    super(`Config validation failed at ${path}: ${details}`);
    this.name = "ConfigValidationError";
    this.path = path;
    this.details = details;
    this.issues = Object.freeze(issues ?? parseIssuesFromDetails(path, details));
  }

  /** Formatted multi-line summary suitable for CLI/log output. */
  formatReport(): string {
    const lines: string[] = [`Config validation failed at "${this.path}":`];
    for (const issue of this.issues) {
      lines.push(`  - [${issue.path}] ${issue.message}`);
    }
    return lines.join("\n");
  }
}

/** Converts a Zod error into a structured issues array. */
export const zodErrorToIssues = (error: z.ZodError, rootPath?: string): ConfigValidationIssue[] =>
  error.issues.map((issue) => {
    const issuePath = issue.path.join(".") || "root";
    const fullPath = rootPath ? `${rootPath}.${issuePath}` : issuePath;
    return {
      path: fullPath,
      message: issue.message,
      code: issue.code,
    };
  });

/** Converts a Zod error into a human-readable multi-line string. */
export const formatZodErrors = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "root";
      return `${path}: ${issue.message}`;
    })
    .join("\n");

/** Creates a ConfigValidationError from a ZodError with full structured context. */
export const configErrorFromZod = (
  sectionPath: string,
  error: z.ZodError,
): ConfigValidationError => {
  const issues = zodErrorToIssues(error, sectionPath);
  const details = formatZodErrors(error);
  return new ConfigValidationError(sectionPath, details, issues);
};

/**
 * Parses a details string back into issues when no explicit issues were provided.
 * Each line in the format "path: message" becomes an issue.
 */
function parseIssuesFromDetails(rootPath: string, details: string): ConfigValidationIssue[] {
  if (!details.trim()) {
    return [];
  }
  return details.split("\n").map((line) => {
    const colonIndex = line.indexOf(": ");
    if (colonIndex > 0) {
      return {
        path: `${rootPath}.${line.slice(0, colonIndex)}`,
        message: line.slice(colonIndex + 2),
      };
    }
    return {
      path: rootPath,
      message: line,
    };
  });
}
