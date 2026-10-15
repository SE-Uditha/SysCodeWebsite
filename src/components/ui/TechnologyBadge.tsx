type Props = {
  label: string;
};

export function TechnologyBadge({ label }: Props) {
  return (
    <span className="inline-flex min-h-10 min-w-0 max-w-full items-center gap-2 rounded-xl border border-orange-100 bg-white px-4 py-2 text-xs font-semibold text-black [overflow-wrap:anywhere] min-[1600px]:text-sm">
      <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-brand" />
      {label}
    </span>
  );
}
