import graphlib from "graphlib";
const { alg } = graphlib;
import { Graph } from "./graph";
import type { EdgeDefinition, GraphDefinition, NodeDefinition } from "./types";

export class GraphBuilder {
  private nodes = new Map<string, NodeDefinition>();
  private edges = new Map<string, EdgeDefinition>();

  addNode(node: NodeDefinition): this {
    this.nodes.set(node.id, node);
    return this;
  }

  addNodes(nodes: NodeDefinition[]): this {
    for (const node of nodes) this.addNode(node);
    return this;
  }

  addEdge(edge: EdgeDefinition): this {
    this.edges.set(edge.id, edge);
    return this;
  }

  addEdges(edges: EdgeDefinition[]): this {
    for (const edge of edges) this.addEdge(edge);
    return this;
  }

  build(): Graph {
    const definition: GraphDefinition = { nodes: this.nodes, edges: this.edges };
    const graph = new Graph(definition);
    validateGraph(graph);
    return graph;
  }
}

export function validateGraph(graph: Graph): void {
  for (const edge of graph.edges.values()) {
    for (const input of edge.inputs) {
      if (!graph.nodes.has(input)) {
        throw new Error(`Edge ${edge.id} missing input node ${input}`);
      }
    }
    for (const output of edge.outputs) {
      if (!graph.nodes.has(output)) {
        throw new Error(`Edge ${edge.id} missing output node ${output}`);
      }
    }
  }

  const cycles = alg.findCycles(graph.internal);
  if (cycles.length > 0) {
    throw new Error(`Graph has cycles: ${JSON.stringify(cycles)}`);
  }

  const outputs = new Map<string, EdgeDefinition[]>();
  for (const edge of graph.edges.values()) {
    for (const out of edge.outputs) {
      const list = outputs.get(out) ?? [];
      list.push(edge);
      outputs.set(out, list);
    }
  }
  for (const [nodeId, list] of outputs.entries()) {
    const nonEstimate = list.filter((edge) => edge.kind !== "estimate");
    if (nonEstimate.length > 1) {
      console.warn(
        `Warning: multiple non-estimate edges produce ${nodeId}: ${nonEstimate
          .map((edge) => edge.id)
          .join(", ")}`,
      );
    }
  }
}
