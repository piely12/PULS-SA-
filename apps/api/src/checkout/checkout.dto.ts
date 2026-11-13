import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CreateAddressDto {
  @IsUUID('all')
  zoneId!: string;

  @IsString()
  @Length(2, 120)
  recipientName!: string;

  @IsString()
  @Matches(/^\+?[0-9 ()-]{8,20}$/)
  recipientPhone!: string;

  @IsString()
  @Length(2, 100)
  commune!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @Length(1, 250)
  landmark?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
