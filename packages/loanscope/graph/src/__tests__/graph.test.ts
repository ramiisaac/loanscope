import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../builder";
import { evaluate, evaluateIncremental, evaluateWithEstimates } from "../execution";
import { Graph } from "../graph";
import {
  ancestorsOf,
  dependentsOf,
  findCycles,
  pathTo,
  reachableFrom,
  topologicalSort,
} from "../traversal";
import { expandDimensions, grid } from "../grid";
import { sweep } from "../sweep";
import { binarySearch, gradientSearch, searchThreshold } from "../search";
import type { EdgeDefinition, NodeDefinition } from "../types";

const node = (
  id: string,
  kind: NodeDefinition["kind"],
  defaultValue?: unknown,
): NodeDefinition => ({
  id,
  kind,
  valueType: "Money",
  ...(defaultValue !== undefined ? { defaultValue } : {}),
});

const edge = (
  id: string,
  inputs: string[],
  outputs: string[],
  compute: EdgeDefinition["compute"],
  kind: EdgeDefinition["kind"] = "transform",
  priority?: number,
): EdgeDefinition => ({
  id,
  kind,
  inputs,
  outputs,
  compute,
  confidence: kind === "estimate" ? "estimated" : "derived",
  ...(priority !== undefined ? { priority } : {}),
});

const buildSimpleGraph = (): Graph => {
  const builder = new GraphBuilder();
  builder.addNodes([node("a", "input"), node("b", "computed"), node("c", "computed")]);
  builder.addEdges([
    edge("e1", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) * 2 })),
    edge("e2", ["b"], ["c"], (inputs) => ({ c: (inputs.b as number) + 1 })),
  ]);
  return builder.build();
};

describe("graph builder and validation", () => {
  it("rejects missing node references", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input")]);
    builder.addEdge(edge("e1", ["a"], ["missing"], () => ({ missing: 1 })));
    expect(() => builder.build()).toThrow("missing output node");
  });

  it("rejects cycles", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdges([
      edge("e1", ["a"], ["b"], (inputs) => ({ b: inputs.a })),
      edge("e2", ["b"], ["a"], (inputs) => ({ a: inputs.b })),
    ]);
    expect(() => builder.build()).toThrow("Graph has cycles");
  });
});

describe("graph traversal", () => {
  const graph = buildSimpleGraph();

  it("produces a topological order that respects dependencies", () => {
    const order = topologicalSort(graph);
    const index = (id: string) => order.indexOf(id);
    expect(index("v:a")).toBeLessThan(index("e:e1"));
    expect(index("e:e1")).toBeLessThan(index("v:b"));
    expect(index("v:b")).toBeLessThan(index("e:e2"));
    expect(index("e:e2")).toBeLessThan(index("v:c"));
  });

  it("finds reachable value nodes from inputs", () => {
    expect(reachableFrom(graph, ["a"])).toEqual(["a", "b", "c"]);
  });

  it("computes ancestors and dependents", () => {
    expect(ancestorsOf(graph, "c").sort()).toEqual(["a", "b"]);
    expect(dependentsOf(graph, "a").sort()).toEqual(["b", "c"]);
  });

  it("computes edge path and missing inputs when disconnected", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "input"), node("c", "computed")]);
    builder.addEdge(edge("e1", ["a", "b"], ["c"], (inputs) => ({ c: inputs.a })));
    const disconnected = builder.build();
    const result = pathTo(disconnected, [], "c");
    expect(result.path).toEqual([]);
    expect(result.missing.sort()).toEqual(["a", "b"]);
  });

  it("detects cycles via traversal helper", () => {
    const nodes = new Map<string, NodeDefinition>([
      ["a", node("a", "input")],
      ["b", node("b", "computed")],
    ]);
    const edges = new Map<string, EdgeDefinition>([
      ["e1", edge("e1", ["a"], ["b"], (inputs) => ({ b: inputs.a }))],
      ["e2", edge("e2", ["b"], ["a"], (inputs) => ({ a: inputs.b }))],
    ]);
    const graphWithCycle = new Graph({ nodes, edges });
    const cycles = findCycles(graphWithCycle);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("handles disconnected-component traversal", () => {
    const builder = new GraphBuilder();
    builder.addNodes([
      node("x", "input"),
      node("y", "computed"),
      node("p", "input"),
      node("q", "computed"),
    ]);
    builder.addEdges([
      edge("e-xy", ["x"], ["y"], (inputs) => ({
        y: (inputs.x as number) + 10,
      })),
      edge("e-pq", ["p"], ["q"], (inputs) => ({
        q: (inputs.p as number) + 20,
      })),
    ]);
    const g = builder.build();

    const fromX = reachableFrom(g, ["x"]);
    expect(fromX.sort()).toEqual(["x", "y"].sort());

    const fromP = reachableFrom(g, ["p"]);
    expect(fromP.sort()).toEqual(["p", "q"].sort());

    const fromBoth = reachableFrom(g, ["x", "p"]);
    expect(fromBoth.sort()).toEqual(["p", "q", "x", "y"].sort());
  });
});

describe("evaluation", () => {
  const graph = buildSimpleGraph();

  it("evaluates derived values from provided inputs", () => {
    const result = evaluate(graph, { a: 2 });

    expect(result.inputs.a).toBeDefined();
    expect(result.inputs.a?.source).toBe("provided");
    expect(result.inputs.a?.value).toBe(2);

    expect(result.computed.b).toBeDefined();
    expect(result.computed.b?.value).toBe(4);
    expect(result.computed.b?.source).toBe("derived");
    expect(result.computed.b?.computedBy).toBe("e1");

    expect(result.computed.c).toBeDefined();
    expect(result.computed.c?.value).toBe(5);
    expect(result.computed.c?.source).toBe("derived");
    expect(result.computed.c?.computedBy).toBe("e2");
  });

  it("tracks blocked nodes when inputs are missing", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "input"), node("c", "computed")]);
    builder.addEdge(edge("e1", ["a", "b"], ["c"], (inputs) => ({ c: inputs.a })));
    const graph2 = builder.build();
    const result = evaluate(graph2, { a: 1 });
    const blocked = result.blocked.find((entry) => entry.nodeId === "c");
    expect(blocked).toBeDefined();
    expect(blocked?.missingInputs).toContain("b");
  });

  it("supports incremental evaluation", () => {
    const first = evaluate(graph, { a: 2 });
    const next = evaluateIncremental(graph, first, { a: 3 });

    expect(next.inputs.a?.value).toBe(3);
    expect(next.computed.b?.value).toBe(6);
    expect(next.computed.c?.value).toBe(7);
  });

  it("evaluates with allowed estimate edges only", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdge(edge("e-est", ["a"], ["b"], (inputs) => ({ b: inputs.a }), "estimate"));
    const graph2 = builder.build();

    const noEstimate = evaluateWithEstimates(graph2, { a: 1 }, []);
    expect(noEstimate.computed.b).toBeUndefined();

    const withEstimate = evaluateWithEstimates(graph2, { a: 1 }, ["e-est"]);
    expect(withEstimate.computed.b).toBeDefined();
    expect(withEstimate.computed.b?.source).toBe("estimated");
  });

  it("treats undefined-valued input keys as missing", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdge(edge("e1", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) * 3 })));
    const g = builder.build();

    const result = evaluate(g, { a: undefined });
    expect(result.inputs.a).toBeUndefined();
    const blocked = result.blocked.find((entry) => entry.nodeId === "b");
    expect(blocked).toBeDefined();
    expect(blocked?.missingInputs).toContain("a");
  });

  it("emits defaulted source for node defaults", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input", 42)]);
    const g = builder.build();

    const result = evaluate(g, {});
    expect(result.inputs.a).toBeUndefined();
    expect(result.computed.a).toBeDefined();
    expect(result.computed.a?.value).toBe(42);
    expect(result.computed.a?.source).toBe("defaulted");
  });

  it("provided takes precedence over defaulted", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input", 42)]);
    const g = builder.build();

    const result = evaluate(g, { a: 99 });
    expect(result.inputs.a).toBeDefined();
    expect(result.inputs.a?.value).toBe(99);
    expect(result.inputs.a?.source).toBe("provided");
    expect(result.computed.a).toBeUndefined();
  });

  it("derived takes precedence over estimated", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdges([
      edge("e-est", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) * 10 }), "estimate"),
      edge("e-derive", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) * 2 }), "transform"),
    ]);
    const g = builder.build();

    const result = evaluate(g, { a: 5 });
    expect(result.computed.b).toBeDefined();
    expect(result.computed.b?.value).toBe(10);
    expect(result.computed.b?.source).toBe("derived");
    expect(result.computed.b?.computedBy).toBe("e-derive");
  });

  it("estimate edges populate estimatesUsed", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdge(
      edge("e-est", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) * 5 }), "estimate"),
    );
    const g = builder.build();

    const result = evaluateWithEstimates(g, { a: 3 }, ["e-est"]);
    expect(result.estimatesUsed.length).toBeGreaterThanOrEqual(1);
    const estEntry = result.estimatesUsed.find((e) => e.nodeId === "b");
    expect(estEntry).toBeDefined();
    expect(estEntry?.estimatedBy).toBe("e-est");
    expect(estEntry?.value).toBe(15);
  });

  it("surfaced executor errors from throwing edge", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdge(
      edge("e-bad", ["a"], ["b"], () => {
        throw new Error("compute blew up");
      }),
    );
    const g = builder.build();

    const result = evaluate(g, { a: 1 });
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const err = result.errors.find((e) => e.edgeId === "e-bad");
    expect(err).toBeDefined();
    expect(err?.message).toContain("compute blew up");
    expect(err?.nodeIds).toContain("b");
  });

  it("meaningful blocked[].missingInputs lists actual missing node IDs", () => {
    const builder = new GraphBuilder();
    builder.addNodes([
      node("x", "input"),
      node("y", "input"),
      node("z", "input"),
      node("out", "computed"),
    ]);
    builder.addEdge(edge("e1", ["x", "y", "z"], ["out"], (inputs) => ({ out: inputs.x })));
    const g = builder.build();

    const result = evaluate(g, { x: 1 });
    const blocked = result.blocked.find((entry) => entry.nodeId === "out");
    expect(blocked).toBeDefined();
    expect(blocked?.missingInputs.sort()).toEqual(["y", "z"]);
  });

  it("deterministic precedence when multiple edges produce same node", () => {
    const builder = new GraphBuilder();
    builder.addNodes([node("a", "input"), node("b", "computed")]);
    builder.addEdges([
      edge("e-high", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) + 100 }), "transform", 1),
      edge("e-low", ["a"], ["b"], (inputs) => ({ b: (inputs.a as number) + 200 }), "transform", 10),
    ]);
    const g = builder.build();

    const result = evaluate(g, { a: 0 });
    expect(result.computed.b).toBeDefined();

    const first = evaluate(g, { a: 0 });
    const second = evaluate(g, { a: 0 });
    expect(first.computed.b?.value).toBe(second.computed.b?.value);
    expect(first.computed.b?.computedBy).toBe(second.computed.b?.computedBy);
  });

  it("evaluateIncremental under new contract", () => {
    const g = buildSimpleGraph();
    const initial = evaluate(g, { a: 10 });
    expect(initial.computed.b?.value).toBe(20);
    expect(initial.computed.c?.value).toBe(21);

    const incremental = evaluateIncremental(g, initial, { a: 5 });
    expect(incremental.inputs.a?.value).toBe(5);
    expect(incremental.computed.b?.value).toBe(10);
    expect(incremental.computed.c?.value).toBe(11);
  });

  it("inputScope vs effectiveScope distinction", () => {
    const builder = new GraphBuilder();
    builder.addNodes([
      node("a", "input"),
      node("b", "input", 99),
      node("c", "computed"),
      node("d", "computed"),
    ]);
    builder.addEdges([
      edge("e1", ["a"], ["c"], (inputs) => ({ c: (inputs.a as number) + 1 })),
      edge("e2", ["b"], ["d"], (inputs) => ({ d: (inputs.b as number) + 2 })),
    ]);
    const g = builder.build();

    const result = evaluate(g, { a: 10 });

    expect(result.inputScope).toContain("a");
    expect(result.inputScope).toContain("c");
    expect(result.inputScope).not.toContain("b");
    expect(result.inputScope).not.toContain("d");

    expect(result.effectiveScope).toContain("a");
    expect(result.effectiveScope).toContain("b");
    expect(result.effectiveScope).toContain("c");
    expect(result.effectiveScope).toContain("d");
  });

  it("check edges produce first-class check outputs", () => {
    const builder = new GraphBuilder();
    builder.addNodes([
      node("loanAmount", "input"),
      node("maxLoan", "input"),
      node("ltv-check", "check"),
    ]);
    builder.addEdge(
      edge(
        "check-edge",
        ["loanAmount", "maxLoan"],
        ["ltv-check"],
        (inputs) => ({
          "ltv-check": {
            key: "ltv-check",
            status: (inputs.loanAmount as number) <= (inputs.maxLoan as number) ? "PASS" : "FAIL",
            actual: String(inputs.loanAmount),
            limit: String(inputs.maxLoan),
          },
        }),
        "check",
      ),
    );
    const g = builder.build();

    const passing = evaluate(g, { loanAmount: 400000, maxLoan: 500000 });
    expect(passing.checks["ltv-check"]).toBeDefined();
    expect(passing.checks["ltv-check"]?.status).toBe("PASS");
    expect(passing.checks["ltv-check"]?.computedBy).toBe("check-edge");
    expect(passing.checks["ltv-check"]?.actual).toBe("400000");
    expect(passing.checks["ltv-check"]?.limit).toBe("500000");

    const failing = evaluate(g, { loanAmount: 600000, maxLoan: 500000 });
    expect(failing.checks["ltv-check"]).toBeDefined();
    expect(failing.checks["ltv-check"]?.status).toBe("FAIL");
  });
});

describe("sweep and grid", () => {
  const graph = buildSimpleGraph();

  it("sweeps a dimension across values", () => {
    const result = sweep(graph, {}, { nodeId: "a", values: [1, 2, 3] });
    expect(result.results).toHaveLength(3);
    expect(result.results[1]?.computed.b?.value).toBe(4);
  });

  it("expands dimensions to a cartesian product", () => {
    const coords = expandDimensions([
      { nodeId: "a", values: [1, 2] },
      { nodeId: "x", values: ["u", "v"] },
    ]);
    expect(coords).toHaveLength(4);
    expect(coords).toContainEqual({ a: 2, x: "v" });
  });

  it("builds grid results with row/column structure", () => {
    const result = grid(graph, {}, [
      { nodeId: "a", values: [1, 2] },
      { nodeId: "d", values: [10, 20] },
    ]);
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0]).toHaveLength(2);
    expect(result.flatCells).toHaveLength(4);
  });
});

describe("search utilities", () => {
  it("binary search finds a feasible threshold", () => {
    const result = binarySearch((value) => ({ pass: value <= 0.7 }), 0, 1, 0.0001, 30);
    expect(result.found).toBe(true);
    expect(Number(result.value)).toBeLessThanOrEqual(0.7);
    expect(Number(result.value)).toBeGreaterThan(0.6);
  });

  it("searchThreshold reports non-monotonic when endpoints are identical", () => {
    const g = buildSimpleGraph();
    const result = searchThreshold(
      g,
      { a: 1 },
      "a",
      () => ({ pass: true }),
      { min: 0, max: 1 },
      { assertMonotone: true },
    );
    expect(result.found).toBe(false);
    expect(result.reason).toBe("non-monotonic");
  });

  it("gradientSearch proxies to searchThreshold", () => {
    const g = buildSimpleGraph();
    const result = gradientSearch(
      g,
      {},
      "a",
      (res) => ({
        pass: res.inputs.a !== undefined || res.computed.a !== undefined,
      }),
      { min: 0, max: 1 },
    );
    expect(result.iterations).toBeGreaterThan(0);
  });
});
