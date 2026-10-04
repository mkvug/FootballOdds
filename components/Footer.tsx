export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`px-4 py-6 text-center text-xs text-muted ${className}`}>
      For entertainment only. Not betting advice. 21+. Gambling problem? Call 1-800-GAMBLER.
      <br />
      Data from ESPN. Unofficial; not affiliated with ESPN or the NFL.
    </footer>
  );
}
