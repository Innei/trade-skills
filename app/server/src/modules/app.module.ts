import { Module } from "@tsuki-hono/common";
import { ChatModule } from "./chat/chat.module.js";
import { HealthModule } from "./health/health.module.js";
import { OverviewModule } from "./overview/overview.module.js";
import { SettingsModule } from "./settings/settings.module.js";

@Module({
  imports: [HealthModule, OverviewModule, SettingsModule, ChatModule],
})
export class AppModule {}
