import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { EmailService } from "../email/email.service";
import { createHash, randomBytes } from "node:crypto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email }
    });

    if (!user) {
      throw new UnauthorizedException("Email ou mot de passe invalide");
    }

    const isPasswordValid = await bcrypt.compare(dto.motDePasse, user.motDePasse);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Email ou mot de passe invalide");
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException("Veuillez vérifier votre adresse email avant de vous connecter");
    }

    const payload = { sub: user.id, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        photoUrl: user.photoUrl,
        role: user.role
      }
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });

    if (user) {
      const code = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
      const passwordResetCodeHash = createHash("sha256").update(code).digest("hex");
      await this.prisma.utilisateur.update({
        where: { id: user.id },
        data: {
          passwordResetCodeHash,
          passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      });

      try {
        await this.emailService.sendPasswordResetCode(user.email, `${user.prenom} ${user.nom}`, code);
      } catch {
        await this.prisma.utilisateur.update({
          where: { id: user.id },
          data: { passwordResetCodeHash: null, passwordResetExpiresAt: null }
        });
        throw new UnauthorizedException("Unable to send the password reset email");
      }
    }

    return { message: "If an account exists for this email, a reset code has been sent." };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const codeHash = createHash("sha256").update(dto.code).digest("hex");
    const user = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });

    if (!user || user.passwordResetCodeHash !== codeHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired password reset code");
    }

    await this.prisma.utilisateur.update({
      where: { id: user.id },
      data: {
        motDePasse: await bcrypt.hash(dto.password, 10),
        passwordResetCodeHash: null,
        passwordResetExpiresAt: null
      }
    });

    return { message: "Password reset successfully" };
  }
}