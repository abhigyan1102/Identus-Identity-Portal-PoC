import { useState } from 'react';
import { shorten } from '@identus/portal-core';

export function Copyable({
  value,
  truncate = true,
  className = '',
}: {
  value: string;
  truncate?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const display = truncate ? shorten(value) : value;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* noop */
        }
      }}
      className={`mono group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-2xs text-stone-700 transition hover:bg-stone-100 ${className}`}
      title={value}
    >
      <span>{display}</span>
      <span className="text-2xs text-stone-400 opacity-0 group-hover:opacity-100">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}
