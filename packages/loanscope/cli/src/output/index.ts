// Barrel for the CLI output rendering layer.
//
// Each module owns one rendering surface (monetary/ratio/rate formatters,
// tabular output, CSV, JSON, diff rendering, scope analysis). Consumers
// import through this barrel rather than the individual files so that
// rendering-seam changes (e.g. a new CSV column, an indentation change)
// stay internal to the `output/` directory.
export * from "./colors";
export * from "./diff-table";
export * from "./format";
export * from "./grid-table";
export * from "./scope";
export * from "./table";
