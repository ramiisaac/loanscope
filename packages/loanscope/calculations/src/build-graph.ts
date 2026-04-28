import { GraphBuilder } from "@loanscope/graph";
import type { Graph } from "@loanscope/graph";
import { getAllEdges, getAllNodes } from "./registry";

/**
 * Builds the canonical mortgage calculation graph with all registered
 * nodes and edges. This function constructs structural topology only --
 * it does not inject any product-specific default values.
 *
 * Rule-derived values (from ProgramRules / ProductDefinition) are
 * assembled and passed as explicit inputs by the engine's evaluate
 * function, which is the single authoritative path for rule application.
 */
export const buildMortgageGraph = (): Graph => {
  const builder = new GraphBuilder();
  builder.addNodes(getAllNodes());
  builder.addEdges(getAllEdges());
  return builder.build();
};

/**
 * Builds the mortgage graph for a given product.
 *
 * Previously this function mutated node default values based on product
 * rules, creating a duplicate rule-application path alongside the
 * engine's explicit input assembly. That dual-path design has been
 * removed -- the engine's evaluate.ts is now the single authoritative
 * location for injecting rule-derived inputs.
 *
 * This function is retained for API compatibility but delegates
 * directly to `buildMortgageGraph` since graph structure is
 * product-independent.
 */
export const buildGraphForProduct = (product: unknown): Graph => {
  void product;
  return buildMortgageGraph();
};
