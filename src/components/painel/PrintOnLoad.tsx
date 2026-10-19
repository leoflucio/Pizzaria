"use client";

import { useEffect } from "react";

export function PrintOnLoad({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (auto) setTimeout(() => window.print(), 300);
  }, [auto]);
  return (
    <>
      <button className="btn-primary" onClick={() => window.print()}>Imprimir</button>
      <button className="btn-ghost" onClick={() => window.close()}>Fechar</button>
    </>
  );
}
