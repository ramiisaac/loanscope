import { CompareForm } from "@/components/compare/compare-form";

export default function ComparePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Product Comparison</h1>
        <p className="text-muted-foreground mt-1">
          Sweep across LTV ratios, interest rates, or loan amounts to compare product eligibility
          and pricing in a grid.
        </p>
      </div>
      <CompareForm />
    </div>
  );
}
