import { Controller, Get } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("users")
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("consultants")
  async getConsultants() {
    return this.prisma.utilisateur.findMany({
      where: { role: Role.CONSULTANT },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        dateCreation: true,
      },
    });
  }

  @Get("dev-identities")
  async getDevIdentities() {
    const users = await this.prisma.utilisateur.findMany({
      where: {
        role: {
          in: [Role.CLIENT, Role.CONSULTANT, Role.ADMINISTRATEUR],
        },
      },
      orderBy: { dateCreation: "asc" },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        dateCreation: true,
      },
    });

    return users.reduce<Partial<Record<Role, (typeof users)[number]>>>(
      (identities, user) => {
        if (!identities[user.role]) {
          identities[user.role] = user;
        }

        return identities;
      },
      {}
    );
  }
}
