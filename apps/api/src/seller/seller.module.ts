import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ProductReviewController } from './product-review.controller';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';

@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  controllers: [SellerController, ProductReviewController],
  providers: [SellerService, JwtAuthGuard, RolesGuard],
})
export class SellerModule {}
