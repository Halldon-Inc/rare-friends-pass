"use client";

import { useState } from "react";

/** Preview any Friend's pass without a wallet: public, read-only numbers. */
export default function Peek() {
  const [col, setCol] = useState("genesis");
  const [id, setId] = useState("");
  const valid = /^[1-9][0-9]{0,9}$/.test(id.trim());
  return (
    <form
      className="peek"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) window.location.href = `/f/${col}-${id.trim()}`;
      }}
    >
      <select aria-label="Collection" value={col} onChange={(e) => setCol(e.target.value)}>
        <option value="genesis">Genesis</option>
        <option value="gen">Generations</option>
      </select>
      <input aria-label="Token id" inputMode="numeric" placeholder="#id" value={id} onChange={(e) => setId(e.target.value.replace(/[^0-9]/g, ""))} />
      <button className="btn ghost" type="submit" disabled={!valid}>
        Preview a pass
      </button>
    </form>
  );
}
