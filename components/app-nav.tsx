"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Phase 4 adds Inventory here.
const TABS = [
  { href: "/recipes", label: "Recipes" },
  { href: "/plan", label: "Plan" },
  { href: "/list", label: "List" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 backdrop-blur md:static md:w-48 md:shrink-0 md:border-t-0 md:border-r md:bg-transparent dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1 md:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="block px-4 py-3 text-center text-sm font-medium text-neutral-600 aria-[current=page]:text-emerald-700 md:rounded-lg md:text-left md:aria-[current=page]:bg-emerald-50 dark:text-neutral-400 dark:aria-[current=page]:text-emerald-400 md:dark:aria-[current=page]:bg-emerald-950"
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
