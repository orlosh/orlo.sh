"use client";

import { useId, useState } from "react";

type Item = { text: string; done: boolean };

const parse = (text: string): Item[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ done: /^\[x\]/i.test(l), text: l.replace(/^\[( |x)\]\s*/i, "") }));

const serialize = (items: Item[]) => items.map((i) => `[${i.done ? "x" : " "}] ${i.text}`).join("\n");

/**
 * Checklist editable que se guarda como texto ("[x] hecho" por línea) en un campo oculto del
 * formulario: el servidor solo ve texto plano y el progreso se calcula igual en todas partes.
 */
export function ChecklistField({ name, label, defaultValue, suggestions = [] }: { name: string; label: string; defaultValue: string | null; suggestions?: string[] }) {
  const id = useId();
  const [items, setItems] = useState<Item[]>(() => {
    const parsed = parse(defaultValue ?? "");
    return parsed.length ? parsed : suggestions.map((text) => ({ text, done: false }));
  });
  const [draft, setDraft] = useState("");
  const done = items.filter((i) => i.done).length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setItems((list) => [...list, { text, done: false }]);
    setDraft("");
  };

  return (
    <fieldset className="space-y-2">
      <legend className="field-label flex w-full items-center justify-between">
        {label}
        <span className="font-mono text-xs font-normal text-slate-500">
          {done}/{items.length}
        </span>
      </legend>
      <input type="hidden" name={name} value={serialize(items)} />
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={`${i}-${item.text}`} className="flex items-center gap-2">
            <input
              id={`${id}-${i}`}
              type="checkbox"
              checked={item.done}
              onChange={() => setItems((list) => list.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              className="size-4 accent-primary"
            />
            <label htmlFor={`${id}-${i}`} className={`flex-1 text-sm ${item.done ? "text-slate-500 line-through" : "text-slate-800"}`}>
              {item.text}
            </label>
            <button type="button" onClick={() => setItems((list) => list.filter((_, j) => j !== i))} className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-carbon" aria-label={`Quitar ${item.text}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label htmlFor={`${id}-new`} className="sr-only">
          Nuevo punto
        </label>
        <input
          id={`${id}-new`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Añadir punto…"
          className="field py-1.5"
        />
        <button type="button" onClick={add} className="btn-ghost">
          Añadir
        </button>
      </div>
    </fieldset>
  );
}
