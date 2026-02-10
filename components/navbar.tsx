"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MobileMenu } from "@/components/mobile-menu";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Multi-Chat", path: "/multi-chat" },
    { name: "Roundtable", path: "/ai-roundtable" },
    { name: "Goal Hub", path: "/goal-hub" },
    { name: "Comparison", path: "/comparison" },
    { name: "Pipeline", path: "/pipeline" },
    { name: "Personas", path: "/personas" },
    { name: "Analytics", path: "/analytics" },
    { name: "Settings", path: "/settings" },
  ];

  return (
    <nav className="border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          MultiLLM
        </Link>
        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`relative px-4 py-2 rounded-lg transition-all smooth-transition ${
                pathname === item.path
                  ? "text-foreground font-medium bg-card border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
        <MobileMenu items={navItems} />
      </div>
    </nav>
  );
}
