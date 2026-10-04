import { Footer } from "@/components/Footer";
import { GameList } from "@/components/GameList";

export default function Home() {
  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-10">
          <h1 className="font-display text-5xl font-extrabold uppercase leading-none tracking-tight sm:text-7xl">
            Football<span className="text-live">Odds</span>
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Live win probability for every NFL and college football game in progress. Pick a game
            to watch the odds move.
          </p>
        </header>
        <GameList />
      </main>
      <Footer />
    </>
  );
}
