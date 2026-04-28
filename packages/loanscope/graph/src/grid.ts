import type { GridResult } from "./types";
import { evaluate } from "./execution";
import type { Graph } from "./graph";

export const expandDimensions = (
  dimensions: Array<{ nodeId: string; values: unknown[] }>,
): Array<Record<string, unknown>> => {
  const results: Array<Record<string, unknown>> = [{}];
  for (const dimension of dimensions) {
    const next: Array<Record<string, unknown>> = [];
    for (const existing of results) {
      for (const value of dimension.values) {
        next.push({ ...existing, [dimension.nodeId]: value });
      }
    }
    results.splice(0, results.length, ...next);
  }
  return results;
};

export const grid = (
  graph: Graph,
  baseInputs: Record<string, unknown>,
  dimensions: Array<{ nodeId: string; values: unknown[] }>,
): GridResult => {
  const coordinates = expandDimensions(dimensions);
  const flatCells = coordinates.map((coords) => ({
    coordinates: coords,
    result: evaluate(graph, { ...baseInputs, ...coords }),
  }));

  const cells: GridResult["cells"] = [];
  if (dimensions.length === 0) {
    cells.push([evaluate(graph, baseInputs)]);
  } else if (dimensions.length === 1) {
    cells.push(flatCells.map((cell) => cell.result));
  } else {
    const rowSize = dimensions[dimensions.length - 1]?.values.length ?? 1;
    for (let i = 0; i < flatCells.length; i += rowSize) {
      cells.push(flatCells.slice(i, i + rowSize).map((cell) => cell.result));
    }
  }

  return { dimensions, cells, flatCells };
};
