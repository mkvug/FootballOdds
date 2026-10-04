import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-6xl font-extrabold uppercase">Game not found</h1>
      <p className="text-muted">That game doesn&apos;t exist or is no longer available.</p>
      <Link href="/" className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-bg">
        Back to all games
      </Link>
    </main>
  );
}
