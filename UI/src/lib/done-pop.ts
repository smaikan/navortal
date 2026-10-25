"use client";
import { useEffect, useState } from "react";

/** Satır ekranda bitmişe dönünce yaklaşık 400ms hareket var. Zaten bitmiş yüklenende yok. Azaltılmış harekette ve sakin görünümde CSS hareketi kapalı. */
export function useDonePop(done: boolean) {
  const [pop, setPop] = useState(false);
  const [previous, setPrevious] = useState(done);
  if (previous !== done) {
    setPrevious(done);
    setPop(done);
  }
  useEffect(() => {
    if (!pop) return;
    const timer = setTimeout(() => setPop(false), 400);
    return () => clearTimeout(timer);
  }, [pop]);
  return pop;
}
