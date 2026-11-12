import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
