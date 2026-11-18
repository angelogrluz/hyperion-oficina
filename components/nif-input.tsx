"use client";

import { useState } from "react";
import { lookupNif } from "@/browser/src/lookup-api";

export function NifInput({ defaultValue = "", required = false }: { defaultValue?: string; required?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [note, setNote] = useState("");
  return (
    <label className="grid gap-1 text-[15px]">NIF
      <input
        name="nif"
        required={required}
        value={value}
        inputMode="numeric"
        className="h-10 rounded-lg border border-[var(--line)] px-3"
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => {
          const form = event.currentTarget.form;
          const nif = event.currentTarget.value;
          if (!form || nif.replace(/\D/g, "").length !== 9) return;
          void lookupNif(nif).then((result) => {
            if (!result.ok) { setNote(result.error); return; }
            fill(form, "name", result.name);
            fill(form, "address", result.address);
            fill(form, "postalCode", result.postalCode);
            fill(form, "city", result.city);
            setNote(result.name ? "Dados preenchidos a partir do NIF." : "");
          });
        }}
      />
      {note ? <span className="text-[13px] text-[var(--muted-text)]">{note}</span> : null}
    </label>
  );
}

function fill(form: HTMLFormElement, name: string, value: string) {
  if (!value) return;
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) return;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
