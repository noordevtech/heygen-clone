"use client";

import { STYLE_PRESETS, type StylePreset } from "@/lib/catalog";

/**
 * Tile-grid style picker. Each tile is a CSS gradient swatch with the style
 * label underneath — keeps the UI library-free without bundling a folder of
 * preview thumbnails. Selecting a tile sets the style id; "None" clears it.
 */
export function StylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <div className="label">Style</div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[420px] overflow-y-auto pr-1">
        {STYLE_PRESETS.map((s) => (
          <StyleTile
            key={s.id}
            style={s}
            active={value === s.id}
            onClick={() => onChange(s.id)}
          />
        ))}
      </div>
      <div className="text-xs text-muted mt-2">
        Selecting a style appends a fingerprint to the image / video prompt sent to the model.
      </div>
    </div>
  );
}

function StyleTile({
  style,
  active,
  onClick,
}: {
  style: StylePreset;
  active: boolean;
  onClick: () => void;
}) {
  const isNone = style.id === "none";
  return (
    <button
      type="button"
      onClick={onClick}
      title={style.hint}
      className={`group rounded-xl overflow-hidden border text-left transition ${
        active ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-muted"
      }`}
    >
      <div
        className="aspect-square w-full flex items-center justify-center text-2xl"
        style={{
          background: isNone
            ? "repeating-linear-gradient(45deg, #f3f4f6 0 8px, #e5e7eb 8px 16px)"
            : `linear-gradient(135deg, ${style.swatch[0]} 0%, ${style.swatch[1]} 100%)`,
        }}
      >
        {isNone && <span className="text-muted">⊘</span>}
      </div>
      <div className="px-2 py-1.5 text-xs">
        <div className={`font-semibold truncate ${active ? "text-ink" : "text-ink/90"}`}>
          {style.label}
        </div>
        <div className="text-[10px] text-muted truncate">{style.hint}</div>
      </div>
    </button>
  );
}
