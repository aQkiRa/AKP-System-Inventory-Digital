import React from 'react';

// Categorical palette (validated, fixed order - see dataviz skill)
export const SERIES = {
  blue: { light: '#2a78d6', dark: '#3987e5' },
  orange: { light: '#eb6834', dark: '#d95926' },
  aqua: { light: '#1baf7a', dark: '#199e70' },
  yellow: { light: '#eda100', dark: '#c98500' },
  green: { light: '#008300', dark: '#008300' },
  red: { light: '#e34948', dark: '#e66767' },
  slate: { light: '#94a3b8', dark: '#64748b' },
};

const fmt = (n) => Number(n || 0).toLocaleString('id-ID');

function useIsDark() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function seriesColor(name, isDark) {
  const c = SERIES[name] || SERIES.blue;
  return isDark ? c.dark : c.light;
}

function chartTheme(isDark) {
  return { grid: isDark ? '#2c2c2a' : '#e1e0d9', muted: '#898781', highlight: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' };
}

// Nice round axis ceiling so gridline labels read 0 / 25 / 50 / 75 / 100
// instead of arbitrary fractions of the raw max.
function niceMax(max) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= max) * pow;
  return step * 4;
}

// Hover (mouse) or tap (touch) a column to pin its values in this box.
// xPct is the column centre as a percentage of the chart width.
function ChartTooltip({ tip }) {
  if (!tip) return null;
  let align = 'translate-x-[-50%]';
  if (tip.xPct < 18) align = 'translate-x-0';
  else if (tip.xPct > 82) align = 'translate-x-[-100%]';
  return (
    <div
      className={`pointer-events-none absolute top-0 z-10 ${align} rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-lg px-3 py-2 text-xs min-w-[130px]`}
      style={{ left: `${tip.xPct}%` }}
      role="status"
    >
      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{tip.title}</p>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function YAxis({ max, height, top, padL, width, theme }) {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = height - (height - top) * f;
    return (
      <g key={f}>
        <line x1={padL} x2={width} y1={y} y2={y} stroke={theme.grid} strokeWidth={1} />
        <text x={padL - 6} y={y + 3} fontSize={9} fill={theme.muted} textAnchor="end" className="tabular-nums">
          {fmt(Math.round(max * f))}
        </text>
      </g>
    );
  });
}

function Legend({ series, isDark, round }) {
  return (
    <div className="flex flex-wrap gap-4 mt-2">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span className={`w-2.5 h-2.5 inline-block ${round ? 'rounded-full' : 'rounded-sm'}`} style={{ background: seriesColor(s.color, isDark) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// Shared column-based layout: every category gets a full-height transparent
// hit area, so thin bars and line points are still easy to hover or tap.
function useColumnHover() {
  const [active, setActive] = React.useState(null);
  const bind = (i) => ({
    onMouseEnter: () => setActive(i),
    onClick: (e) => {
      e.stopPropagation();
      setActive((cur) => (cur === i ? null : i));
    },
  });
  return { active, bind, clear: () => setActive(null) };
}

const W = 620;
const PAD_L = 36;
const PAD_R = 8;

export function HourlyBarChart({ data, height = 160 }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);
  const { active, bind, clear } = useColumnHover();
  const top = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.sacks)));
  const plotW = W - PAD_L - PAD_R;
  const colW = plotW / Math.max(1, data.length);
  const color = seriesColor('blue', isDark);
  const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

  const tip = active !== null && data[active]
    ? {
        xPct: ((PAD_L + (active + 0.5) * colW) / W) * 100,
        title: `${hourLabel(data[active].hour)} – ${hourLabel((data[active].hour + 1) % 24)}`,
        rows: [{ label: 'Produksi', value: `${fmt(data[active].sacks)} sak`, color }],
      }
    : null;

  return (
    <div className="relative" onMouseLeave={clear}>
      <ChartTooltip tip={tip} />
      <svg viewBox={`0 0 ${W} ${height + 22}`} className="w-full select-none" role="img" aria-label="Produksi per jam hari ini">
        <YAxis max={max} height={height} top={top} padL={PAD_L} width={W - PAD_R} theme={theme} />
        {data.map((d, i) => {
          const h = (d.sacks / max) * (height - top);
          const x = PAD_L + i * colW;
          return (
            <g key={d.hour} {...bind(i)} className="cursor-pointer">
              <rect x={x} y={0} width={colW} height={height} fill={active === i ? theme.highlight : 'transparent'} />
              <rect x={x + 1} y={height - h} width={Math.max(1, colW - 2)} height={h} rx={2} fill={color} opacity={active === null || active === i ? 1 : 0.55} />
              {d.hour % 3 === 0 && (
                <text x={x + colW / 2} y={height + 15} fontSize={9} fill={theme.muted} textAnchor="middle">
                  {String(d.hour).padStart(2, '0')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// categories: [{ label, values: { [seriesKey]: number } }]
// series: [{ key, label, color }] - colors follow the fixed categorical order.
export function GroupedBarChart({ categories, series, height = 170, unit = 'sak' }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);
  const { active, bind, clear } = useColumnHover();
  const top = 10;
  const max = niceMax(Math.max(0, ...categories.flatMap((c) => series.map((s) => c.values[s.key] || 0))));
  const plotW = W - PAD_L - PAD_R;
  const groupW = plotW / Math.max(1, categories.length);
  const innerPad = Math.min(14, groupW * 0.18);
  const barW = Math.max(3, (groupW - innerPad * 2 - (series.length - 1) * 2) / Math.max(1, series.length));
  const labelEvery = Math.ceil(categories.length / 12);

  const tip = active !== null && categories[active]
    ? {
        xPct: ((PAD_L + (active + 0.5) * groupW) / W) * 100,
        title: categories[active].label,
        rows: series.map((s) => ({ label: s.label, value: `${fmt(categories[active].values[s.key])} ${unit}`, color: seriesColor(s.color, isDark) })),
      }
    : null;

  if (categories.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-10">Belum ada data untuk periode ini</p>;
  }

  return (
    <div className="relative" onMouseLeave={clear}>
      <ChartTooltip tip={tip} />
      <svg viewBox={`0 0 ${W} ${height + 22}`} className="w-full select-none" role="img">
        <YAxis max={max} height={height} top={top} padL={PAD_L} width={W - PAD_R} theme={theme} />
        {categories.map((c, ci) => {
          const gx = PAD_L + ci * groupW;
          return (
            <g key={c.label} {...bind(ci)} className="cursor-pointer">
              <rect x={gx} y={0} width={groupW} height={height} fill={active === ci ? theme.highlight : 'transparent'} />
              {series.map((s, si) => {
                const v = c.values[s.key] || 0;
                const h = (v / max) * (height - top);
                return (
                  <rect
                    key={s.key}
                    x={gx + innerPad + si * (barW + 2)}
                    y={height - h}
                    width={barW}
                    height={Math.max(0, h)}
                    rx={2}
                    fill={seriesColor(s.color, isDark)}
                    opacity={active === null || active === ci ? 1 : 0.55}
                  />
                );
              })}
              {ci % labelEvery === 0 && (
                <text x={gx + groupW / 2} y={height + 15} fontSize={10} fill={theme.muted} textAnchor="middle">
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Legend series={series} isDark={isDark} />
    </div>
  );
}

export function TrendLineChart({ data, series, height = 180, unit = 'sak' }) {
  const isDark = useIsDark();
  const theme = chartTheme(isDark);
  const { active, bind, clear } = useColumnHover();
  const top = 8;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] || 0))));
  const padX = 14;
  const plotW = W - PAD_L - PAD_R - padX * 2;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const xAt = (i) => PAD_L + padX + (data.length > 1 ? i * stepX : plotW / 2);
  const yAt = (v) => height - ((v || 0) / max) * (height - top);
  const colW = data.length > 1 ? stepX : plotW;

  const pathFor = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(d[key])}`).join(' ');

  const tip = active !== null && data[active]
    ? {
        xPct: (xAt(active) / W) * 100,
        title: data[active].label,
        rows: series.map((s) => ({ label: s.label, value: `${fmt(data[active][s.key])} ${unit}`, color: seriesColor(s.color, isDark) })),
      }
    : null;

  return (
    <div className="relative" onMouseLeave={clear}>
      <ChartTooltip tip={tip} />
      <svg viewBox={`0 0 ${W} ${height + 20}`} className="w-full select-none" role="img" aria-label="Tren 7 hari">
        <YAxis max={max} height={height} top={top} padL={PAD_L} width={W - PAD_R} theme={theme} />
        {active !== null && <line x1={xAt(active)} x2={xAt(active)} y1={top} y2={height} stroke={theme.muted} strokeDasharray="3 3" strokeWidth={1} />}
        {series.map((s) => (
          <path key={s.key} d={pathFor(s.key)} fill="none" stroke={seriesColor(s.color, isDark)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {series.map((s) =>
          data.map((d, i) => (
            <circle key={`${s.key}-${i}`} cx={xAt(i)} cy={yAt(d[s.key])} r={active === i ? 5 : 3} fill={seriesColor(s.color, isDark)} stroke={isDark ? '#0f172a' : '#fff'} strokeWidth={active === i ? 2 : 0} />
          ))
        )}
        {data.map((d, i) => (
          <g key={d.label} {...bind(i)} className="cursor-pointer">
            <rect x={xAt(i) - colW / 2} y={0} width={colW} height={height + 20} fill="transparent" />
            <text x={xAt(i)} y={height + 16} fontSize={9} fill={theme.muted} textAnchor="middle">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
      <Legend series={series} isDark={isDark} round />
    </div>
  );
}

export function DonutChart({ slices, size = 160, centerLabel = 'Delivered', centerKey = 'delivered', unit = 'sak' }) {
  const isDark = useIsDark();
  const [active, setActive] = React.useState(null);
  const sum = slices.reduce((s, x) => s + x.value, 0);
  const total = sum || 1;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * r;
  let acc = 0;

  const focus = slices.find((s) => s.key === active);
  const centerValue = focus ? focus.value : slices.find((s) => s.key === centerKey)?.value || 0;
  const toggle = (key) => (e) => {
    e.stopPropagation();
    setActive((cur) => (cur === key ? null : key));
  };

  return (
    <div className="flex items-center gap-6 flex-wrap" onMouseLeave={() => setActive(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status pengiriman hari ini" className="select-none">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? '#2c2c2a' : '#e1e0d9'} strokeWidth={strokeWidth} />
        {slices.filter((s) => s.value > 0).map((s) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const offset = -acc * circumference;
          acc += frac;
          return (
            <circle
              key={s.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seriesColor(s.color, isDark)}
              strokeWidth={active === s.key ? strokeWidth + 6 : strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={active === null || active === s.key ? 1 : 0.45}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setActive(s.key)}
              onClick={toggle(s.key)}
            />
          );
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={focus ? 17 : 20} fontWeight="700" fill={isDark ? '#ffffff' : '#0b0b0b'}>
          {focus ? `${fmt(focus.value)} ${unit}` : `${Math.round((centerValue / total) * 100)}%`}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill={isDark ? '#c3c2b7' : '#52514e'}>
          {focus ? `${focus.label} · ${Math.round((focus.value / total) * 100)}%` : centerLabel}
        </text>
      </svg>
      <div className="space-y-1">
        {slices.map((s) => (
          <button
            type="button"
            key={s.key}
            onMouseEnter={() => setActive(s.key)}
            onClick={toggle(s.key)}
            className={`flex items-center gap-2 text-sm rounded px-1.5 py-0.5 w-full text-left ${active === s.key ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
          >
            <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: seriesColor(s.color, isDark) }} />
            <span className="text-slate-700 dark:text-slate-300">{s.label}</span>
            <span className="text-slate-400 dark:text-slate-500 text-xs tabular-nums">
              {sum > 0 ? Math.round((s.value / total) * 100) : 0}% &middot; {fmt(s.value)} {unit}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
