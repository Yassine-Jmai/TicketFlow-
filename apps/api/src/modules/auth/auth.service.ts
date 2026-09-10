import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
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
}