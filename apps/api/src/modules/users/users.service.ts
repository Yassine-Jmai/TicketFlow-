// users.service.ts
import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

const SAFE_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  photoUrl: true,
  role: true,
  dateCreation: true
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(role?: string) {
    return this.prisma.utilisateur.findMany({
      where: role ? { role: role as any } : undefined,
      select: SAFE_SELECT
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id },
      select: SAFE_SELECT
    });
    if (!user) throw new NotFoundException("Utilisateur introuvable");
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email }
    });
    if (existing) throw new ConflictException("Email déjà utilisé");

    const hashedPassword = await bcrypt.hash(dto.motDePasse, 10);

    return this.prisma.utilisateur.create({
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        motDePasse: hashedPassword,
        role: dto.role ?? "CLIENT"
      },
      select: SAFE_SELECT
    });
  }

  async update(id: string, dto: { nom?: string; prenom?: string; email?: string; photoUrl?: string }) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Utilisateur introuvable");

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException("Email déjà utilisé");
    }

    return this.prisma.utilisateur.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT
    });
  }
}