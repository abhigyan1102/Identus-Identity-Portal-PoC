import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-stone-200 bg-white px-6 py-12 text-center">
      <div className="text-sm font-medium text-stone-800">{title}</div>
      <div className="mx-auto mt-1 max-w-sm text-2xs text-stone-500">{description}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
