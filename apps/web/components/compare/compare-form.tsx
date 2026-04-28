"use client";

import { useState, useTransition } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Loader2, BarChart3 } from "lucide-react";
import { runComparison, type CompareInput, type CompareResult } from "@/app/compare/actions";
import { GridResults } from "./grid-results";

const SWEEP_DEFAULTS: Record<
  CompareInput["sweepType"],
  { min: number; max: number; step: number; label: string }
> = {
  ltv: { min: 0.7, max: 0.95, step: 0.05, label: "LTV Ratio" },
  rate: { min: 5.0, max: 7.5, step: 0.25, label: "Note Rate (%)" },
  loanAmount: {
    min: 400000,
    max: 1000000,
    step: 100000,
    label: "Loan Amount ($)",
  },
};

export function CompareForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CompareResult | null>(null);

  const [loanAmount, setLoanAmount] = useState("800000");
  const [purchasePrice, setPurchasePrice] = useState("1000000");
  const [fico, setFico] = useState("740");
  const [monthlyIncome, setMonthlyIncome] = useState("15000");
  const [noteRate, setNoteRate] = useState("6.875");
  const [sweepType, setSweepType] = useState<CompareInput["sweepType"]>("ltv");
  const [sweepMin, setSweepMin] = useState(String(SWEEP_DEFAULTS.ltv.min));
  const [sweepMax, setSweepMax] = useState(String(SWEEP_DEFAULTS.ltv.max));
  const [sweepStep, setSweepStep] = useState(String(SWEEP_DEFAULTS.ltv.step));

  const handleSweepTypeChange = (value: string) => {
    const type = value as CompareInput["sweepType"];
    setSweepType(type);
    const defaults = SWEEP_DEFAULTS[type];
    setSweepMin(String(defaults.min));
    setSweepMax(String(defaults.max));
    setSweepStep(String(defaults.step));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const input: CompareInput = {
        loanAmount: Number(loanAmount),
        purchasePrice: Number(purchasePrice),
        fico: Number(fico),
        monthlyIncome: Number(monthlyIncome),
        noteRate: Number(noteRate),
        sweepType,
        sweepMin: Number(sweepMin),
        sweepMax: Number(sweepMax),
        sweepStep: Number(sweepStep),
      };
      const res = await runComparison(input);
      setResult(res);
    });
  };

  const defaults = SWEEP_DEFAULTS[sweepType];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Comparison Parameters</CardTitle>
          <CardDescription>
            Configure a base scenario and sweep dimension to compare products across a range of
            values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cmp-loan">Loan Amount ($)</Label>
                <Input
                  id="cmp-loan"
                  type="number"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  min={1}
                  step={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cmp-price">Purchase Price ($)</Label>
                <Input
                  id="cmp-price"
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  min={1}
                  step={1000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cmp-fico">FICO Score</Label>
                <Input
                  id="cmp-fico"
                  type="number"
                  value={fico}
                  onChange={(e) => setFico(e.target.value)}
                  min={300}
                  max={850}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cmp-income">Monthly Income ($)</Label>
                <Input
                  id="cmp-income"
                  type="number"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  min={0}
                  step={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cmp-rate">Note Rate (%)</Label>
                <Input
                  id="cmp-rate"
                  type="number"
                  value={noteRate}
                  onChange={(e) => setNoteRate(e.target.value)}
                  min={0}
                  max={20}
                  step={0.125}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Sweep Dimension</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="cmp-sweep">Sweep Type</Label>
                  <Select value={sweepType} onValueChange={handleSweepTypeChange}>
                    <SelectTrigger id="cmp-sweep" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ltv">LTV Ratio</SelectItem>
                      <SelectItem value="rate">Note Rate</SelectItem>
                      <SelectItem value="loanAmount">Loan Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cmp-sweep-min">Min ({defaults.label})</Label>
                  <Input
                    id="cmp-sweep-min"
                    type="number"
                    value={sweepMin}
                    onChange={(e) => setSweepMin(e.target.value)}
                    step={sweepType === "loanAmount" ? 10000 : 0.01}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cmp-sweep-max">Max ({defaults.label})</Label>
                  <Input
                    id="cmp-sweep-max"
                    type="number"
                    value={sweepMax}
                    onChange={(e) => setSweepMax(e.target.value)}
                    step={sweepType === "loanAmount" ? 10000 : 0.01}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cmp-sweep-step">Step</Label>
                  <Input
                    id="cmp-sweep-step"
                    type="number"
                    value={sweepStep}
                    onChange={(e) => setSweepStep(e.target.value)}
                    step={sweepType === "loanAmount" ? 5000 : 0.005}
                    min={sweepType === "loanAmount" ? 1000 : 0.001}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? <Loader2 className="animate-spin" /> : <BarChart3 />}
              {isPending ? "Running comparison..." : "Run Comparison"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && <GridResults result={result} />}
    </div>
  );
}
