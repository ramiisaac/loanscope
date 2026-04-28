import { QuoteForm } from "@/components/quote/quote-form";

export default function QuotePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quick Quote</h1>
        <p className="text-muted-foreground">Evaluate a loan scenario across all products</p>
      </div>
      <QuoteForm />
    </div>
  );
}
