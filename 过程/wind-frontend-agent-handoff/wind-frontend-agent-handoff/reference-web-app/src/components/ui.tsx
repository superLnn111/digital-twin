import type { ReactNode } from 'react';
import type { Level } from '../lib/host';

export function Section({
  index,
  title,
  aside,
  children,
  className,
}: {
  index?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className ?? ''}`}>
      <header className="section-head">
        {index && <span className="section-index">{index}</span>}
        <h2>{title}</h2>
        {aside && <div className="section-aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * A labelled numeric readout. `value === null` renders the explicit `unknown`
 * reason instead of a number — missing data is never shown as 0.
 */
export function Readout({
  label,
  value,
  unit,
  level = 'ok',
  unknown = '未采样',
  hint,
  wide,
}: {
  label: string;
  value: string | null;
  unit?: string;
  level?: Level;
  unknown?: string;
  hint?: ReactNode;
  wide?: boolean;
}) {
  const lv = value === null ? 'unknown' : level;
  return (
    <div className={`readout lv-${lv} ${wide ? 'wide' : ''}`}>
      <div className="readout-label">
        <span className={`dot lv-${lv}`} />
        {label}
      </div>
      {value === null ? (
        <div className="readout-value unknown">{unknown}</div>
      ) : (
        <div className="readout-value">
          {value}
          {unit && <span className="unit">{unit}</span>}
        </div>
      )}
      {hint && <div className="readout-hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  title,
}: {
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  title?: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  return (
    <div
      className={`segmented ${size}`}
      role="radiogroup"
      aria-label={title}
      style={{ ['--seg-n' as string]: options.length, ['--seg-i' as string]: idx }}
    >
      <span className="segmented-thumb" aria-hidden />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tag({ level = 'neutral', children, title }: { level?: Level | 'neutral' | 'sim' | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span className={`tag tag-${level}`} title={title}>
      {children}
    </span>
  );
}

export function fmt(v: number | null | undefined, digits = 2): string | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : v.toFixed(digits);
}

export function fmtInt(v: number | null | undefined): string | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v).toLocaleString('en-US');
}

export function fmtBytes(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KiB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MiB`;
  return `${(v / 1024 ** 3).toFixed(2)} GiB`;
}
