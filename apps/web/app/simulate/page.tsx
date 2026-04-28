import { SimulateForm } from "@/components/simulate/simulate-form";

export default function SimulatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Simulation</h1>
        <p className="text-muted-foreground mt-1">
          Explore state-space actions to find paths toward product eligibility. The engine evaluates
          combinations of pay-downs, down payment adjustments, and other actions.
        </p>
      </div>
      <SimulateForm />
    </div>
  );
}
