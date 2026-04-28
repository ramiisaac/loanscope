"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Separator } from "@workspace/ui/components/separator";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden size-8">
            <Menu className="size-4" />
            <span className="sr-only">Toggle navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle className="text-lg font-semibold tracking-tight">LoanScope</SheetTitle>
          </SheetHeader>
          <Separator className="my-2" />
          <Sidebar className="px-2" />
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight lg:hidden">LoanScope</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
