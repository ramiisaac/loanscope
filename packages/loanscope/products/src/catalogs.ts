import type { LenderDefinition, ProductDefinition } from "@loanscope/domain";
import { FannieBase, FreddieBase } from "./channels/agency";
import { GovernmentBase } from "./channels/government";
import { PortfolioBase } from "./channels/portfolio";
import { Conforming } from "./agency/conforming";
import { HighBalance } from "./agency/high-balance";
import { HomeReady } from "./agency/fannie/home-ready";
import { ConformingARM, HighBalanceARM } from "./agency/fannie/arm";
import { HomePossible } from "./agency/freddie/home-possible";
import { FreddieConforming } from "./agency/freddie/conforming";
import { FreddieHighBalance } from "./agency/freddie/high-balance";
import { FreddieConformingARM, FreddieHighBalanceARM } from "./agency/freddie/arm";
import { FHA } from "./government/fha";
import { FhaStreamline } from "./government/fha-streamline";
import { VA } from "./government/va";
import { VaIrrrl } from "./government/va-irrrl";
import { USDA } from "./government/usda";
import { UsdaStreamline } from "./government/usda-streamline";
import { uwmLender } from "./uwm/lender";
import { resolveAllProducts } from "./resolver";

const agencyCatalog: ProductDefinition[] = [
  FannieBase,
  FreddieBase,
  Conforming,
  ConformingARM,
  HighBalance,
  HighBalanceARM,
  HomeReady,
  HomePossible,
  FreddieConforming,
  FreddieConformingARM,
  FreddieHighBalance,
  FreddieHighBalanceARM,
];

const governmentCatalog: ProductDefinition[] = [
  GovernmentBase,
  FHA,
  FhaStreamline,
  VA,
  VaIrrrl,
  USDA,
  UsdaStreamline,
];

const portfolioCatalog: ProductDefinition[] = [PortfolioBase];

/** Agency channel lender grouping for product catalog organization. */
export const agencyLender: LenderDefinition = {
  id: "agency",
  name: "Agency",
  products: agencyCatalog,
};

/** Government channel lender grouping for product catalog organization. */
export const governmentLender: LenderDefinition = {
  id: "government",
  name: "Government",
  products: governmentCatalog,
};

/** Portfolio channel lender grouping for product catalog organization. */
export const portfolioLender: LenderDefinition = {
  id: "portfolio",
  name: "Portfolio",
  products: portfolioCatalog,
};

/**
 * Returns all channel-level lender groupings plus the UWM lender.
 * For registry-based lender management with validation, presets,
 * and product-source flows, use @loanscope/lenders instead.
 */
export const getAllLenders = (): LenderDefinition[] => [
  agencyLender,
  governmentLender,
  portfolioLender,
  uwmLender,
];

/**
 * Returns the fully resolved product catalog across all lenders.
 * Flattens inheritance chains via resolveAllProducts.
 * For registry-based product retrieval, use @loanscope/lenders instead.
 */
export const getAllProducts = (): ProductDefinition[] => {
  const products = getAllLenders().flatMap((lender) => lender.products);
  return resolveAllProducts(products);
};
