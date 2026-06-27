type Props = {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
};

export function CircularProgress({ value, max, size = 140, stroke = 10, label, sublabel }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, max === 0 ? 0 : value / max);
  const offset = c * (1 - pct);
  const done = pct >= 1;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="oklch(0.27 0.005 250)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={done ? "oklch(0.7 0.16 150)" : "oklch(0.72 0.19 50)"}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-2xl font-semibold tabular-nums">
          {value}
          <span className="text-muted-foreground text-base font-normal">/{max}</span>
        </div>
        {label && <div className="text-xs text-muted-foreground mt-0.5">{label}</div>}
        {sublabel && <div className="text-[10px] text-muted-foreground/70">{sublabel}</div>}
      </div>
    </div>
  );
}
