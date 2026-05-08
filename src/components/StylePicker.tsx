"use client";

import { useState } from "react";
import { STYLE_PRESETS, type StylePreset } from "@/lib/catalog";

/**
 * Tile-grid style picker. Each tile tries to render /styles/{id}.jpg as the
 * preview thumbnail. If that asset is missing the tile falls back to a CSS
 * gradient swatch built from the preset's two-color recipe — drop image
 * crops into public/styles/{id}.jpg whenever you have them and the tiles
 * upgrade automatically without code changes.
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
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[460px] overflow-y-auto pr-1">
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
        Drop preview crops into <code className="text-ink">public/styles/&lt;id&gt;.jpg</code> to replace
        the gradient swatches. Selecting a style appends a fingerprint to the image / video prompt
        sent to the model.
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
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !isNone && !imgFailed;
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
        className="aspect-square w-full flex items-center justify-center text-2xl relative"
        style={{
          background: isNone
            ? "repeating-linear-gradient(45deg, #f3f4f6 0 8px, #e5e7eb 8px 16px)"
            : `linear-gradient(135deg, ${style.swatch[0]} 0%, ${style.swatch[1]} 100%)`,
        }}
      >
        {showImage && (
          <img
            src={`/styles/${style.id}.jpg`}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {isNone && <span className="text-muted relative z-10">⊘</span>}
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
