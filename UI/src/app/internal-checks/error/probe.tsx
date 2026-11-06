"use client";

import { useState } from "react";

export function ErrorProbe() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error("UI boundary test fixture");
  return (
    <div className="actions">
      <button onClick={() => setFailed(true)}>Kontrollü hata oluştur</button>
    </div>
  );
}
