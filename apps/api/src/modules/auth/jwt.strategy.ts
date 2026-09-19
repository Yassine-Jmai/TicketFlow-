import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const jwtSecret = process.env.JWT_SECRET ?? "TicketFlowSuperSecretJWTKey2026!";

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret
    });
  }

  async validate(payload: { sub: string; role: string }) {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, deletedAt: true }
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException("Utilisateur introuvable");
    }

    return { userId: user.id, role: user.role };
  }
}
