"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface MobileMenuProps {
  items: { name: string; path: string }[];
}

export function MobileMenu({ items }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden rainbow-outline-hover">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] border-border bg-background/95 p-6 sm:w-[320px]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="mt-8 flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              data-active={pathname === item.path ? 'true' : 'false'}
              className={`nav-rainbow-link rounded-md px-4 py-2 transition-colors ${
                pathname === item.path
                  ? "bg-card text-foreground rainbow-outline-hover"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
              onClick={() => setOpen(false)}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
