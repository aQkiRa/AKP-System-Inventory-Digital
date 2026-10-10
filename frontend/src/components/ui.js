import React, { useRef } from 'react';
import { Sun, Moon, Calendar, Plus, Minus } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function FieldLabel({ children, required }) {
  return (
    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
    </span>
  );
}

// Sizes offered everywhere, in display order (5 kg is retired).
export const SAK_SIZES = [20, 15, 10];
export const DEFAULT_SAK_SIZE = 20;

export function QtyCounter({ label, value, onChange, min = 0, compact = false, ...props }) {
  const num = Number(value) || 0;
  const btn = compact ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <div className={label ? 'mb-3' : ''}>
      {label && <FieldLabel required={props.required}>{label}</FieldLabel>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, num - 1))}
          className={`${btn} shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95`}
          aria-label="Kurangi"
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(min, Number(e.target.value) || 0))}
          className={`flex-1 min-w-0 w-0 text-center font-bold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 ${compact ? 'text-base py-1.5' : 'text-2xl py-2'}`}
        />
        <button
          type="button"
          onClick={() => onChange(num + 1)}
          className={`${btn} shrink-0 rounded-lg bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center active:scale-95`}
          aria-label="Tambah"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white',
    secondary: 'bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    ghost: 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
  };
  return (
    <button
      className={`px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, className = '', wrapperClassName = 'mb-3', ...props }) {
  return (
    <label className={`block ${wrapperClassName}`}>
      {label && <FieldLabel required={props.required}>{label}</FieldLabel>}
      <input
        className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({ label, children, className = '', wrapperClassName = 'mb-3', ...props }) {
  return (
    <label className={`block ${wrapperClassName}`}>
      {label && <FieldLabel required={props.required}>{label}</FieldLabel>}
      <select
        className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function DateInput({ label, className = '', wrapperClassName = 'mb-3', ...props }) {
  const ref = useRef(null);

  function openPicker() {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // fall through to focus
      }
    }
    el.focus();
  }

  return (
    <label className={`block ${wrapperClassName}`}>
      {label && <FieldLabel required={props.required}>{label}</FieldLabel>}
      <div
        onClick={openPicker}
        className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 flex items-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-brand-500 ${className}`}
      >
        <Calendar size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
        <input
          ref={ref}
          type="date"
          className="bg-transparent text-slate-900 dark:text-slate-100 w-full focus:outline-none cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
          {...props}
        />
      </div>
    </label>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <label className="block mb-3">
      {label && <FieldLabel required={props.required}>{label}</FieldLabel>}
      <textarea
        className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    green: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    blue: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto overflow-x-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Table({ columns, rows, empty = 'Tidak ada data' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
            {columns.map((c) => (
              <th key={c.key} className="py-2 pr-4 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-slate-400 dark:text-slate-500">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, idx) => (
            <tr
              key={row._id || row.id || idx}
              className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              {columns.map((c) => (
                <td key={c.key} className="py-2 pr-4 text-slate-700 dark:text-slate-200">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STAT_ICON_TONES = {
  blue: { tile: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30', glow: 'rgba(14,165,233,0.18)' },
  green: { tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', glow: 'rgba(16,185,129,0.18)' },
  violet: { tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30', glow: 'rgba(99,102,241,0.18)' },
  red: { tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30', glow: 'rgba(244,63,94,0.18)' },
  yellow: { tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30', glow: 'rgba(245,158,11,0.18)' },
};

export function StatCard({ label, value, sub, tone = 'blue', icon: Icon }) {
  const tones = {
    blue: 'text-brand-600 dark:text-brand-400',
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    red: 'text-red-600 dark:text-red-400',
    violet: 'text-indigo-600 dark:text-indigo-300',
  };
  if (Icon) {
    const t = STAT_ICON_TONES[tone] || STAT_ICON_TONES.blue;
    return (
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5"
        style={{ backgroundImage: `radial-gradient(circle at 92% 8%, ${t.glow}, transparent 55%)` }}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${t.tile}`}>
            <Icon size={16} />
          </span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        </div>
        <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
      </div>
    );
  }
  return (
    <Card>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </Card>
  );
}

export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Mode Siang' : 'Mode Malam'}
      className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 ${className}`}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
