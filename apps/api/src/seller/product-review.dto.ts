import { IsBoolean } from 'class-validator';

export class ProductReviewDto {
  @IsBoolean()
  approved!: boolean;
}
