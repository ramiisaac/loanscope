"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calculator, GitCompare, PlayCircle, Building2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/quote", label: "Quick Quote", icon: Calculator },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/simulate", label: "Simulate", icon: PlayCircle },
  { href: "/lenders", label: "Lenders", icon: Building2 },
] as const;

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1 px-2 py-4", className)}>
      {navItems.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { navItems };
