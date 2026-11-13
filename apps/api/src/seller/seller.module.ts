import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ProductReviewController } from './product-review.controller';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SellerController, ProductReviewController],
  providers: [SellerService],
})
export class SellerModule {}
