"use client";

import { Search } from "lucide-react";

export function AdminSearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        className="input py-2! pl-9! text-sm"
        value={value}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
