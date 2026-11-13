import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductReviewDto } from './product-review.dto';
import { SellerService } from './seller.service';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductReviewController {
  constructor(private readonly seller: SellerService) {}

  @Get()
  pendingReview() {
    return this.seller.pendingReview();
  }

  @Post(':productId/review')
  review(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: ProductReviewDto,
  ) {
    return this.seller.review(request.user.sub, productId, input.approved);
  }
}
