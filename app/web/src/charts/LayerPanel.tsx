import { useState } from "react";

export interface LayerItem {
  key: string;
  label: string;
  color: string;
  toggle: (v: boolean) => void;
}

export interface LayerGroup {
  title: string;
  items: LayerItem[];
}

export function LayerPanel({ groups }: { groups: LayerGroup[] }) {
  const [collapsed, setCollapsed] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const isOn = (key: string) => checked[key] ?? true;

  if (!groups.length) return null;

  return (
    <div className={`layer-panel${collapsed ? " collapsed" : ""}`}>
      <div className="lp-header" onClick={() => setCollapsed(!collapsed)}>
        <span>图层</span>
        <span className="lp-arrow">▾</span>
      </div>
      <div className="lp-body">
        {groups.map((g) => (
          <div key={g.title} className="lp-group">
            <div className="lp-group-title">{g.title}</div>
            {g.items.map((it) => (
              <label key={it.key}>
                <input
                  type="checkbox"
                  checked={isOn(it.key)}
                  onChange={(e) => {
                    setChecked((prev) => ({ ...prev, [it.key]: e.target.checked }));
                    it.toggle(e.target.checked);
                  }}
                />
                <span className="lp-swatch" style={{ background: it.color }} />
                {it.label}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
