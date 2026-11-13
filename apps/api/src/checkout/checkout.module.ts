import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  controllers: [CheckoutController],
  providers: [CheckoutService, JwtAuthGuard, RolesGuard],
})
export class CheckoutModule {}
