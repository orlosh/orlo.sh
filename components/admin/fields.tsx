"use client";

import { useId, useState } from "react";
import { Markdown } from "@/components/content/Markdown";
import { useFieldError } from "./ActionForm";

const inputCls =
  "w-full rounded-sm border border-border-dark/15 bg-white px-3 py-2 text-sm text-carbon placeholder:text-slate-400 focus:border-carbon aria-[invalid=true]:border-red-500";

function Wrapper({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label block">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { name: string; label: string; hint?: string; required?: boolean };

export function TextField({
  name,
  label,
  hint,
  required,
  defaultValue,
  type = "text",
  placeholder,
}: Common & { defaultValue?: string | number | null; type?: string; placeholder?: string }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
        className={inputCls}
      />
    </Wrapper>
  );
}

export function TextArea({
  name,
  label,
  hint,
  defaultValue,
  rows = 4,
  mono = false,
}: Common & { defaultValue?: string | null; rows?: number; mono?: boolean }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}
        className={`${inputCls} ${mono ? "font-mono text-xs" : ""}`}
      />
    </Wrapper>
  );
}

/** Textarea de Markdown con una vista previa renderizada por el mismo componente que el sitio público. */
export function MarkdownField({
  name,
  label,
  hint,
  defaultValue,
  rows = 8,
}: Common & { defaultValue?: string | null; rows?: number }) {
  const id = useId();
  const error = useFieldError(name);
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  return (
    <Wrapper id={id} label={label} hint={hint ?? "Markdown. El HTML crudo se ignora."} error={error}>
      <div className="mb-2 flex gap-2 font-mono text-xs">
        <button
          type="button"
          onClick={() => setPreview(false)}
          aria-pressed={!preview}
          className={!preview ? "text-carbon" : "text-slate-600 hover:text-carbon"}
        >
          escribir
        </button>
        <span className="text-slate-400">/</span>
        <button
          type="button"
          onClick={() => setPreview(true)}
          aria-pressed={preview}
          className={preview ? "text-carbon" : "text-slate-600 hover:text-carbon"}
        >
          vista previa
        </button>
      </div>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        hidden={preview}
        aria-invalid={error ? true : undefined}
        className={`${inputCls} font-mono text-xs leading-relaxed`}
      />
      {preview ? (
        <div className="min-h-24 rounded-sm border border-border-dark/15 p-4">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-slate-600">Vacío</p>}
        </div>
      ) : null}
    </Wrapper>
  );
}

export function Select({
  name,
  label,
  hint,
  defaultValue,
  options,
}: Common & { defaultValue?: string | null; options: { value: string; label: string }[] }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={error ? true : undefined} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-carbon" />
      <label htmlFor={id} className="text-sm text-slate-800">
        {label}
      </label>
    </div>
  );
}

/** Selector de tecnologías agrupado por capa. */
export function TechnologyPicker({
  groups,
  selected,
}: {
  groups: { name: string; technologies: { id: string; name: string }[] }[];
  selected: string[];
}) {
  const chosen = new Set(selected);
  return (
    <fieldset className="space-y-3">
      <legend className="label">Tecnologías</legend>
      {groups.map((g) => (
        <div key={g.name}>
          <p className="mb-1.5 text-xs text-slate-600">{g.name}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {g.technologies.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm text-slate-800">
                <input
                  type="checkbox"
                  name="technologyIds"
                  value={t.id}
                  defaultChecked={chosen.has(t.id)}
                  className="size-3.5 accent-carbon"
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
