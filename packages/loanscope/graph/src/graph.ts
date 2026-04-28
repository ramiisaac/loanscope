import graphlib from "graphlib";
import type { EdgeDefinition, GraphDefinition, NodeDefinition } from "./types";

type GraphlibGraphType = InstanceType<typeof graphlib.Graph>;

export const valueNodeId = (nodeId: string): string => `v:${nodeId}`;
export const edgeNodeId = (edgeId: string): string => `e:${edgeId}`;

export class Graph {
  readonly nodes: Map<string, NodeDefinition>;
  readonly edges: Map<string, EdgeDefinition>;
  readonly internal: GraphlibGraphType;

  constructor(definition: GraphDefinition) {
    this.nodes = definition.nodes;
    this.edges = definition.edges;
    this.internal = new graphlib.Graph({ directed: true });
    for (const node of this.nodes.values()) {
      this.internal.setNode(valueNodeId(node.id), { type: "value", id: node.id });
    }
    for (const edge of this.edges.values()) {
      this.internal.setNode(edgeNodeId(edge.id), { type: "edge", id: edge.id });
      for (const input of edge.inputs) {
        this.internal.setEdge(valueNodeId(input), edgeNodeId(edge.id));
      }
      for (const output of edge.outputs) {
        this.internal.setEdge(edgeNodeId(edge.id), valueNodeId(output));
      }
    }
  }

  getNode(nodeId: string): NodeDefinition | undefined {
    return this.nodes.get(nodeId);
  }

  getEdge(edgeId: string): EdgeDefinition | undefined {
    return this.edges.get(edgeId);
  }
}
