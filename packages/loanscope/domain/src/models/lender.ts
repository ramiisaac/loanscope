import { ProductDefinition } from "./product";
import { ProgramRules } from "./rules";

export interface Overlay {
  baseProductId: string;
  overrides: Partial<ProgramRules>;
}

export interface LenderDefinition {
  id: string;
  name: string;
  products: ProductDefinition[];
  overlays?: Overlay[];
}
