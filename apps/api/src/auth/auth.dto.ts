import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  refreshToken!: string;
}

export class LogoutDto extends RefreshDto {}
