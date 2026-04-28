"use client";

import { useState, useTransition } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Loader2, FlaskConical } from "lucide-react";
import { runSimulation, type SimulateInput, type SimulateResult } from "@/app/simulate/actions";
import { SimulationResults } from "./simulation-results";

const OBJECTIVES = [
  { id: "MaximizeEligible", label: "Maximize Eligible Products" },
  { id: "MinimizeCash", label: "Minimize Cash Required" },
  { id: "MaximizeWorstMargin", label: "Maximize Worst Margin" },
  { id: "MinimizeActions", label: "Minimize Actions" },
] as const;

export function SimulateForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SimulateResult | null>(null);

  const [loanAmount, setLoanAmount] = useState("800000");
  const [purchasePrice, setPurchasePrice] = useState("1000000");
  const [fico, setFico] = useState("740");
  const [monthlyIncome, setMonthlyIncome] = useState("15000");
  const [noteRate, setNoteRate] = useState("6.875");
  const [maxDepth, setMaxDepth] = useState("3");
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>(["MaximizeEligible"]);

  const toggleObjective = (id: string) => {
    setSelectedObjectives((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const input: SimulateInput = {
        loanAmount: Number(loanAmount),
        purchasePrice: Number(purchasePrice),
        fico: Number(fico),
        monthlyIncome: Number(monthlyIncome),
        noteRate: Number(noteRate),
        maxDepth: Number(maxDepth),
        objectives: selectedObjectives,
      };
      const res = await runSimulation(input);
      setResult(res);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Simulation Parameters</CardTitle>
          <CardDescription>
            Configure a scenario and simulation constraints. The engine explores state-space actions
            (pay down loan, adjust down payment, etc.) to find paths to eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="sim-loan">Loan Amount ($)</Label>
                <Input
                  id="sim-loan"
                  type="number"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  min={1}
                  step={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-price">Purchase Price ($)</Label>
                <Input
                  id="sim-price"
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  min={1}
                  step={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-fico">FICO Score</Label>
                <Input
                  id="sim-fico"
                  type="number"
                  value={fico}
                  onChange={(e) => setFico(e.target.value)}
                  min={300}
                  max={850}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-income">Monthly Income ($)</Label>
                <Input
                  id="sim-income"
                  type="number"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  min={0}
                  step={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-rate">Note Rate (%)</Label>
                <Input
                  id="sim-rate"
                  type="number"
                  value={noteRate}
                  onChange={(e) => setNoteRate(e.target.value)}
                  min={0}
                  max={20}
                  step={0.125}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-depth">Max Actions</Label>
                <Select value={maxDepth} onValueChange={setMaxDepth}>
                  <SelectTrigger id="sim-depth" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} action{n > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Objectives</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {OBJECTIVES.map((obj) => (
                  <div key={obj.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`obj-${obj.id}`}
                      checked={selectedObjectives.includes(obj.id)}
                      onCheckedChange={() => toggleObjective(obj.id)}
                    />
                    <Label htmlFor={`obj-${obj.id}`} className="cursor-pointer font-normal">
                      {obj.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              {isPending ? "Simulating..." : "Run Simulation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && <SimulationResults result={result} />}
    </div>
  );
}
