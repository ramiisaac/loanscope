export type Money = number & { readonly __brand: "Money" };
export type Ratio = number & { readonly __brand: "Ratio" };
export type RatePct = number & { readonly __brand: "RatePct" };
export type Months = number & { readonly __brand: "Months" };
export type Units = 1 | 2 | 3 | 4;

export const money = (n: number): Money => n as Money;
export const ratio = (n: number): Ratio => n as Ratio;
export const ratePct = (n: number): RatePct => n as RatePct;
export const months = (n: number): Months => n as Months;

export const ratioToPercent = (r: Ratio): number => Number(r) * 100;
export const percentToRatio = (p: number): Ratio => ratio(p / 100);

export const annualToMonthly = (annual: Money): Money => money(Number(annual) / 12);
export const monthlyToAnnual = (monthly: Money): Money => money(Number(monthly) * 12);

/**
 * Exhaustive check helper for discriminated unions.
 * Place in the `default` branch of a switch statement to get a compile error
 * if any variant is not handled.
 */
export const assertNever = (value: never, message?: string): never => {
  throw new Error(message ?? `Unexpected value: ${String(value)}`);
};
