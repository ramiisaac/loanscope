import Link from "next/link";
import { Calculator, GitCompare, PlayCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { getAllProducts } from "@loanscope/products";
import { filterDisplayProducts } from "@loanscope/products";

export default function DashboardPage() {
  const allProducts = getAllProducts();
  const displayProducts = filterDisplayProducts(allProducts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Mortgage underwriting analysis engine</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available Products</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{displayProducts.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Across {allProducts.length} total product definitions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-4 text-lg font-medium">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calculator className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Quick Quote</CardTitle>
              </div>
              <CardDescription>
                Evaluate a loan scenario against all products instantly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm">
                <Link href="/quote">Run Quote</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitCompare className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Compare</CardTitle>
              </div>
              <CardDescription>
                Compare product eligibility across LTV, FICO, or DTI ranges
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link href="/compare">Compare Products</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PlayCircle className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Simulate</CardTitle>
              </div>
              <CardDescription>Run Monte Carlo simulations on loan scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link href="/simulate">Run Simulation</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
