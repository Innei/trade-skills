import { ROLE_LABEL, type Role, type RoleMode } from "./types";

const MODE_OPTIONS: Array<{ mode: RoleMode; label: string }> = [
  { mode: "inherit", label: "跟随主模型" },
  { mode: "custom", label: "自定义" },
  { mode: "disabled", label: "停用" },
];

export function RoleModeControl({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: RoleMode;
  onChange: (mode: RoleMode) => void;
}) {
  return (
    <div className="settings-role-mode" role="radiogroup" aria-label={ROLE_LABEL[role] + "分配方式"}>
      {MODE_OPTIONS.map((option) => (
        <label className="settings-role-mode-option" key={option.mode}>
          <input
            checked={value === option.mode}
            name={"settings-role-mode-" + role}
            onChange={() => onChange(option.mode)}
            type="radio"
            value={option.mode}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
