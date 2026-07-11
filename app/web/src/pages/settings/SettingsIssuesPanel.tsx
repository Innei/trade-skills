import { Check, TriangleAlert } from "lucide-react";
import { Card, SectionTitle } from "../../ui";
import type { SettingsIssue } from "./settingsViewModel";

export function SettingsIssuesPanel({ issues }: { issues: SettingsIssue[] }) {
  return (
    <Card className="settings-issues-card">
      <SectionTitle>需处理</SectionTitle>
      {issues.length === 0 ? (
        <div className="settings-issues-empty">
          <Check aria-hidden="true" size={12} />
          没有需要处理的配置问题
        </div>
      ) : (
        <div className="settings-issues-list">
          {issues.map((issue) => (
            <div className={"settings-issue settings-issue--" + issue.tone} key={issue.id}>
              <TriangleAlert aria-hidden="true" size={12} />
              <div className="settings-issue-copy">
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
              </div>
              <a href={"#" + issue.targetId}>处理</a>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
