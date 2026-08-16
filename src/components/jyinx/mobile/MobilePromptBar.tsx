"use client";

import { useState } from "react";

type Props = { onSubmit: (prompt: string) => void; onAttach: () => void; onVoice: () => void };

export function MobilePromptBar({ onSubmit, onAttach, onVoice }: Props) {
  const [value, setValue] = useState("");
  const submit = () => { const prompt = value.trim(); if (!prompt) return; onSubmit(prompt); setValue(""); };
  return <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><div className="glass flex items-center gap-2 rounded-2xl border border-border p-2 shadow-2xl"><button type="button" onClick={onAttach} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-lg text-muted hover:text-gold" aria-label="Attach repository context">+</button><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="Plan, ask, build..." className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted" /><button type="button" onClick={onVoice} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:text-gold" aria-label="Voice input">◉</button><button type="button" onClick={submit} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold text-sm text-background" aria-label="Start task">↑</button></div></div>;
}
