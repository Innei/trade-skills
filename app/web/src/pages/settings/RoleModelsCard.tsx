import { Card, SectionTitle } from "../../ui";
import { PrimaryRow } from "./PrimaryRow";
import { RoleRow } from "./RoleRow";
import type { SettingsViewModel } from "./settingsViewModel";
import {
  ROLES,
  type AiRoles,
  type Catalog,
  type CredentialEntry,
  type Role,
  type RoleSetting,
} from "./types";

export function RoleModelsCard({
  initialRoles,
  roles,
  catalog,
  credentials,
  view,
  onDraftChange,
}: {
  initialRoles: AiRoles;
  roles: AiRoles;
  catalog: Catalog;
  credentials: CredentialEntry[];
  view: SettingsViewModel;
  onDraftChange: (role: Role | "primary", next: RoleSetting) => void;
}) {
  return (
    <Card className="settings-roles-card">
      <div className="settings-card-heading">
        <SectionTitle>模型分配</SectionTitle>
        <span>
          {view.summary.usageLabel === "暂不可用"
            ? "今日用量暂不可用"
            : "今日合计 " + view.summary.usageLabel}
        </span>
      </div>
      <PrimaryRow
        initial={initialRoles.primary}
        draft={roles.primary}
        catalog={catalog}
        credentials={credentials}
        onDraftChange={(next) => onDraftChange("primary", next)}
      />
      <div className="settings-roles-scroll">
        <div className="settings-role-table-head" aria-hidden="true">
          <span>用途</span>
          <span>分配方式</span>
          <span>当前生效模型</span>
          <span>今日用量</span>
          <span />
        </div>
        {ROLES.map((role) => (
          <RoleRow
            key={role}
            role={role}
            initial={initialRoles[role]}
            draft={roles[role]}
            catalog={catalog}
            credentials={credentials}
            view={view.roles[role]}
            onDraftChange={(next) => onDraftChange(role, next)}
          />
        ))}
      </div>
    </Card>
  );
}
