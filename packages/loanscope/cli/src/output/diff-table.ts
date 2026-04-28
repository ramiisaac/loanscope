import { assertNever } from "@loanscope/domain";
import type {
  DiffEntry,
  DiffMetadata,
  DiffReport,
  GridSummaryDelta,
  SimulationReportDelta,
} from "../commands/diff/index";

const INDENT = "  ";

const formatValue = (value: unknown): string => {
  if (value === undefined) return "<undefined>";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Objects / arrays: compact JSON with a hard cap so single-line output
  // stays readable. The full payload is always available via `--json`.
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return "<unserializable>";
  const MAX = 120;
  return serialized.length > MAX ? `${serialized.slice(0, MAX - 3)}...` : serialized;
};

const formatPath = (path: string): string => (path === "" ? "<root>" : path);

const formatEntry = (entry: DiffEntry): string => {
  const pathDisplay = formatPath(entry.path);
  switch (entry.kind) {
    case "added":
      return `+ ${pathDisplay} = ${formatValue(entry.after)}`;
    case "removed":
      return `- ${pathDisplay} = ${formatValue(entry.before)}`;
    case "changed":
      return `~ ${pathDisplay}: ${formatValue(entry.before)} -> ${formatValue(entry.after)}`;
    default:
      return assertNever(entry);
  }
};

const renderMetadataBlock = (label: string, meta: DiffMetadata): string[] => {
  const lines: string[] = [`${label}: ${meta.id}`];
  lines.push(`${INDENT}name: ${meta.name}`);
  if (meta.description !== undefined && meta.description !== null) {
    lines.push(`${INDENT}description: ${meta.description}`);
  }
  lines.push(`${INDENT}createdAt: ${meta.createdAt}`);
  return lines;
};

const renderEntryList = (heading: string, entries: ReadonlyArray<DiffEntry>): string[] => {
  const lines: string[] = [heading];
  if (entries.length === 0) {
    lines.push(`${INDENT}(no changes)`);
    return lines;
  }
  for (const entry of entries) {
    lines.push(`${INDENT}${formatEntry(entry)}`);
  }
  return lines;
};

const formatSignedNumber = (n: number): string => (n > 0 ? `+${n}` : String(n));

const renderGridSummaryDelta = (delta: GridSummaryDelta): string[] => [
  "GridSummary delta (B - A):",
  `${INDENT}totalCells:    ${formatSignedNumber(delta.totalCells)}`,
  `${INDENT}passCount:     ${formatSignedNumber(delta.passCount)}`,
  `${INDENT}failCount:     ${formatSignedNumber(delta.failCount)}`,
  `${INDENT}warnCount:     ${formatSignedNumber(delta.warnCount)}`,
  `${INDENT}partialCount:  ${formatSignedNumber(delta.partialCount)}`,
  `${INDENT}errorCount:    ${formatSignedNumber(delta.errorCount)}`,
];

const renderSimulationDelta = (delta: SimulationReportDelta): string[] => [
  "SimulationReport delta (B - A):",
  `${INDENT}statesExplored:      ${formatSignedNumber(delta.statesExplored)}`,
  `${INDENT}terminated:          ${delta.terminatedBefore} -> ${delta.terminatedAfter}`,
  `${INDENT}perProductFixes.len: ${formatSignedNumber(delta.perProductFixesDelta)}`,
  `${INDENT}bestStates.len:      ${formatSignedNumber(delta.bestStatesDelta)}`,
];

const renderAsymmetryNote = (asymmetry: DiffReport["resultAsymmetry"]): string | null => {
  switch (asymmetry) {
    case "a-only":
      return "Note: A has a stored result payload; B does not.";
    case "b-only":
      return "Note: B has a stored result payload; A does not.";
    case "both-null":
      return "Note: neither A nor B has a stored result payload.";
    case "none":
    case undefined:
      return null;
  }
};

/**
 * Renders a `DiffReport` as a stable, human-readable text block. Sections
 * are separated by blank lines: metadata (A then B), configPayload diff,
 * resultPayload diff (with optional asymmetry note), and an optional
 * domain-summary delta (grid or simulation).
 */
export const renderDiffReport = (report: DiffReport): string => {
  const sections: string[][] = [];

  sections.push([`Diff kind: ${report.kind}`]);
  sections.push(renderMetadataBlock("A", report.metadata.a));
  sections.push(renderMetadataBlock("B", report.metadata.b));

  sections.push(renderEntryList("configPayload diff:", report.configPayload));

  const resultSection = renderEntryList("resultPayload diff:", report.resultPayload);
  const note = renderAsymmetryNote(report.resultAsymmetry);
  if (note !== null) {
    resultSection.push(`${INDENT}${note}`);
  }
  sections.push(resultSection);

  if (report.gridSummaryDelta !== undefined) {
    sections.push(renderGridSummaryDelta(report.gridSummaryDelta));
  }
  if (report.simulationDelta !== undefined) {
    sections.push(renderSimulationDelta(report.simulationDelta));
  }

  return sections.map((block) => block.join("\n")).join("\n\n");
};
