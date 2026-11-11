import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post('refresh')
  refresh(@Body() input: RefreshDto) {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout')
  logout(@Body() input: LogoutDto) {
    return this.auth.logout(input.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.accessPayload(request.user);
  }
}
