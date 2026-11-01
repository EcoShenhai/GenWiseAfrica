import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { initials } from '../lib/format';

export function Logo({ size = 40, withText = true, light = false, to = '/' }) {
  return (
    <Link to={to} className="inline-flex items-center gap-3" aria-label="GenWise Africa home">
      <img src="/brand/logo-192.png" alt="" width={size} height={size} className="rounded-full ring-1 ring-gold/40" style={{ width: size, height: size }} />
      {withText && (
        <span className="leading-none">
          <span className={`block font-display text-[1.35rem] font-semibold tracking-[0.06em] ${light ? 'text-gold-light' : 'text-night'}`}>GenWise Africa</span>
          <span className={`block text-[11px] ${light ? 'text-dawn/70' : 'text-ink-muted'}`}>Generation of Wisdom</span>
        </span>
      )}
    </Link>
  );
}

export const Spinner = ({ className = '' }) => <Loader2 className={`h-5 w-5 animate-spin text-emerald ${className}`} aria-label="Loading" />;

export function PageLoader() {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const s = kind === 'error' ? 'bg-red-50 text-red-800 border-red-200' : kind === 'success' ? 'bg-emerald-50 text-emerald border-emerald/20' : 'bg-gold-pale/60 text-night border-gold/30';
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${s}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function Field({ label, hint, children, id }) {
  return (
    <div>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Input({ label, hint, id, ...p }) {
  const fid = id || p.name;
  return <Field label={label} hint={hint} id={fid}><input id={fid} className="input" {...p} /></Field>;
}
export function Textarea({ label, hint, id, rows = 4, ...p }) {
  const fid = id || p.name;
  return <Field label={label} hint={hint} id={fid}><textarea id={fid} rows={rows} className="input" {...p} /></Field>;
}
export function Select({ label, hint, id, options, ...p }) {
  const fid = id || p.name;
  return (
    <Field label={label} hint={hint} id={fid}>
      <select id={fid} className="input" {...p}>
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  );
}

export function Avatar({ name, src, size = 36 }) {
  return src
    ? <img src={src} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex items-center justify-center rounded-full bg-night text-gold-light font-semibold" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
}

export function Badge({ tone = 'muted', children }) {
  const t = { muted: 'bg-dawn-200 text-ink-muted', emerald: 'bg-emerald-50 text-emerald', gold: 'bg-gold-pale text-night', night: 'bg-night text-gold-light', red: 'bg-red-50 text-red-700' }[tone];
  return <span className={`chip ${t}`}>{children}</span>;
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-gold" />}
      <h3 className="font-display text-2xl font-semibold text-night">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input,textarea,select,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-night">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-muted hover:bg-dawn" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-dawn-200" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${value === t.value ? 'border-gold text-night' : 'border-transparent text-ink-muted hover:text-night'}`}>
          {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-gold-pale px-1.5 text-xs text-night">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Six-box one-time-code input with paste support */
export function CodeInput({ value, onChange, length = 6, autoFocus = true }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');
  const set = (i, ch) => {
    const arr = digits.map((d) => (d === ' ' ? '' : d));
    arr[i] = ch;
    onChange(arr.join('').slice(0, length));
  };
  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={(e) => {
      const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, length);
      if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(t.length, length - 1)]?.focus(); }
    }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1}
          autoFocus={autoFocus && i === 0} aria-label={`Digit ${i + 1}`} value={d.trim()}
          onChange={(e) => { const ch = e.target.value.replace(/\D/g, '').slice(-1); set(i, ch); if (ch && i < length - 1) refs.current[i + 1]?.focus(); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus(); }}
          className="h-14 w-11 rounded-xl border border-dawn-300 bg-white text-center font-display text-3xl font-semibold text-night focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30 sm:w-12" />
      ))}
    </div>
  );
}

marked.setOptions({ breaks: true });
export function Markdown({ children, className = 'prose-gw' }) {
  const html = DOMPurify.sanitize(marked.parse(String(children || '')));
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ProgressBar({ value }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-dawn-200" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald transition-all" style={{ width: `${Math.min(100, value || 0)}%` }} /></div>;
}

export function Toast({ message, onDone }) {
  useEffect(() => { if (!message) return undefined; const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [message, onDone]);
  if (!message) return null;
  return <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-night px-5 py-2.5 text-sm text-gold-light shadow-lg">{message}</div>;
}

export function useToast() {
  const [msg, setMsg] = useState('');
  return { toast: setMsg, toastEl: <Toast message={msg} onDone={() => setMsg('')} /> };
}

export function SectionHeader({ title, children, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-4xl font-semibold text-night">{title}</h1>
        {children && <p className="mt-1 text-ink-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
