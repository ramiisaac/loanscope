import type { EdgeDefinition, NodeDefinition } from "@loanscope/graph";
import { inputNodes, intermediateNodes, outputNodes } from "./nodes";
import {
  aggregationEdges,
  borrowerBlendEdges,
  cashEdges,
  dtiEdges,
  financedLoanAmountEdges,
  governmentFeesEdges,
  housingEdges,
  incomePolicyEdges,
  ltvEdges,
  paymentEdges,
  reservesEdges,
  subjectRentalEdges,
} from "./edges";
import { estimatePropertyTaxEdge } from "./estimates/property-tax";
import { estimateInsuranceEdge } from "./estimates/insurance";
import { estimateHoaEdge } from "./estimates/hoa";
import { estimateClosingCostsEdge } from "./estimates/closing-costs";
import { estimateMiEdge } from "./estimates/mi";
import { checkEdges } from "./checks";

export const getAllNodes = (): NodeDefinition[] => [
  ...inputNodes,
  ...intermediateNodes,
  ...outputNodes,
];

export const getTransformEdges = (): EdgeDefinition[] => [
  ...ltvEdges,
  ...paymentEdges,
  ...dtiEdges,
  ...housingEdges,
  ...cashEdges,
  ...reservesEdges,
  ...aggregationEdges,
  ...governmentFeesEdges,
  ...financedLoanAmountEdges,
  ...incomePolicyEdges,
  ...borrowerBlendEdges,
  ...subjectRentalEdges,
];

export const getEstimateEdges = (): EdgeDefinition[] => [
  estimatePropertyTaxEdge,
  estimateInsuranceEdge,
  estimateHoaEdge,
  estimateClosingCostsEdge,
  estimateMiEdge,
];

export const getCheckEdges = (): EdgeDefinition[] => [...checkEdges];

export const getAllEdges = (): EdgeDefinition[] => [
  ...getTransformEdges(),
  ...getEstimateEdges(),
  ...getCheckEdges(),
];
