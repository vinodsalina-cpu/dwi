import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GEMINI_TEXT_MODELS } from "@platform/domain-prompt-optimizer/types";

type Model = { id: string; label: string };

export interface GeminiModelPickerProps {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}

export function GeminiModelPicker({ value, onChange, disabled = false }: GeminiModelPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherValue, setOtherValue] = useState("");
  const models = useMemo<Model[]>(() => [...GEMINI_TEXT_MODELS], []);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized ? models.filter((model) => `${model.label} ${model.id}`.toLowerCase().includes(normalized)) : models.slice(0, 5);
    return matches;
  }, [models, query]);
  const selected = models.find((model) => model.id === value);
  const display = selected?.label ?? (value ? `${value} (custom)` : "Choose a Gemini model");

  function close(): void {
    setOpen(false);
    setQuery("");
    setOtherOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function choose(model: string): void {
    onChange(model);
    close();
  }

  function saveOther(): void {
    const model = otherValue.trim();
    if (!model) return;
    choose(model);
    setOtherValue("");
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown, true); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open]);

  return <div ref={rootRef} className="model-picker">
    <button ref={triggerRef} type="button" className="model-picker-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span>{display}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <section id={listId} className="model-picker-popover" role="dialog" aria-label="Choose Gemini model">
      <input autoFocus className="model-picker-search" type="search" aria-label="Search Gemini models" placeholder="Search models" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="model-picker-list" role="listbox" aria-label="Gemini text models">
        {filtered.map((model) => <button key={model.id} type="button" role="option" aria-selected={model.id === value} onClick={() => choose(model.id)}><span>{model.label}</span><small>{model.id}</small></button>)}
        {filtered.length === 0 && <span className="model-picker-empty" role="status">No listed model matches that search.</span>}
      </div>
      <div className="model-picker-other">
        {!otherOpen ? <button type="button" className="model-picker-other-trigger" onClick={() => setOtherOpen(true)}>Other model…</button> : <div className="model-picker-other-form">
          <input type="text" aria-label="Custom Gemini model ID" placeholder="gemini-flash-latest" value={otherValue} onChange={(event) => setOtherValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveOther(); } if (event.key === "Escape") { event.preventDefault(); setOtherOpen(false); } }} />
          <button type="button" className="primary" disabled={!otherValue.trim()} onClick={saveOther}>Use model</button>
        </div>}
      </div>
    </section>}
  </div>;
}
