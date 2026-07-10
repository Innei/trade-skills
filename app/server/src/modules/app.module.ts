import { Module } from "@tsuki-hono/common";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [HealthModule],
})
export class AppModule {}
