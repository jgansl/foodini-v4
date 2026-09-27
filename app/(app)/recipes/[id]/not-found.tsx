import Link from "next/link";
import { ui } from "@/components/ui";

export default function RecipeNotFound() {
  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Recipe not found</h1>
      <p className="mt-2">It may have been deleted.</p>
      <Link href="/recipes" className={`${ui.buttonSecondary} mt-4`}>
        Back to recipes
      </Link>
    </main>
  );
}
