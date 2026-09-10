import { Body, Controller, Get, Post, Query, UsePipes, ValidationPipe } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { UsersService } from "../users/users.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Post("login")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("verify-email")
  verifyEmail(@Query("token") token?: string) {
    if (!token) return { verified: false, message: "Verification token is missing" };
    return this.usersService.verifyEmail(token).then(() => ({ verified: true }));
  }

  @Post("verify-code")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  verifyEmailCode(@Body() body: { email: string; code: string }) {
    return this.usersService.verifyEmailCode(body.email, body.code).then(() => ({ verified: true }));
  }
}