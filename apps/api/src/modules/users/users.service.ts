// users.service.ts
import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { EmailService } from "../email/email.service";
import { createHash, randomBytes } from "node:crypto";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService
  ) {}

  async findAll(excludeUserId?: string) {
    return this.prisma.utilisateur.findMany({
      where: {
        role: { in: ["CLIENT", "CONSULTANT"] },
        id: excludeUserId ? { not: excludeUserId } : undefined
      },
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

    const verificationToken = randomBytes(32).toString("hex");
    const verificationTokenHash = createHash("sha256").update(verificationToken).digest("hex");
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
    const verificationCodeHash = createHash("sha256").update(verificationCode).digest("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.prisma.utilisateur.create({
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        motDePasse: hashedPassword,
        role: "CLIENT",
        emailVerified: false,
        verificationTokenHash,
        verificationCodeHash,
        verificationExpiresAt
      },
      select: SAFE_SELECT
    });

    try {
      await this.emailService.sendVerificationEmail({
        recipientEmail: user.email,
        recipientName: `${user.prenom} ${user.nom}`,
        token: verificationToken,
        code: verificationCode
      });
    } catch (error) {
      await this.prisma.utilisateur.delete({ where: { id: user.id } });
      throw error;
    }

    return user;
  }

  async verifyEmail(token: string) {
    const verificationTokenHash = createHash("sha256").update(token).digest("hex");
    const user = await this.prisma.utilisateur.findFirst({ where: { verificationTokenHash } });

    if (!user || !user.verificationExpiresAt || user.verificationExpiresAt < new Date()) {
      throw new NotFoundException("Lien de vérification invalide ou expiré");
    }

    return this.prisma.utilisateur.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationTokenHash: null,
        verificationCodeHash: null,
        verificationExpiresAt: null
      },
      select: SAFE_SELECT
    });
  }

  async verifyEmailCode(email: string, code: string) {
    const verificationCodeHash = createHash("sha256").update(code).digest("hex");
    const user = await this.prisma.utilisateur.findUnique({ where: { email } });

    if (
      !user ||
      user.emailVerified ||
      user.verificationCodeHash !== verificationCodeHash ||
      !user.verificationExpiresAt ||
      user.verificationExpiresAt < new Date()
    ) {
      throw new NotFoundException("Code de vérification invalide ou expiré");
    }

    return this.prisma.utilisateur.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationTokenHash: null,
        verificationCodeHash: null,
        verificationExpiresAt: null
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

  async updateRole(id: string, actorId: string, dto: UpdateRoleDto) {
    if (id === actorId) {
      throw new ConflictException("Un administrateur ne peut pas modifier son propre rôle");
    }

    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Utilisateur introuvable");

    if (user.role === "ADMINISTRATEUR") {
      throw new ConflictException("Le rôle d'un administrateur ne peut pas être modifié ici");
    }

    const updatedUser = await this.prisma.utilisateur.update({
      where: { id },
      data: { role: dto.role },
      select: SAFE_SELECT
    });

    try {
      await this.emailService.sendAccountNotification({
        recipientEmail: updatedUser.email,
        recipientName: `${updatedUser.prenom} ${updatedUser.nom}`,
        subject: "Your TicketFlow role was updated",
        message: `An administrator changed your account role to ${updatedUser.role}.`
      });
    } catch {
      // The role change remains valid if email delivery is temporarily unavailable.
    }

    return updatedUser;
  }

  async delete(id: string, actorId: string) {
    if (id === actorId) {
      throw new ConflictException("Un administrateur ne peut pas supprimer son propre compte");
    }

    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Utilisateur introuvable");
    if (user.role === "ADMINISTRATEUR") {
      throw new ConflictException("Le compte d'un administrateur ne peut pas être supprimé ici");
    }

    await this.prisma.$transaction(async (transaction) => {
      const ownedTickets = await transaction.ticket.findMany({
        where: { OR: [{ clientId: id }, { createdById: id }] },
        select: { id: true }
      });
      const ownedTicketIds = ownedTickets.map((ticket) => ticket.id);

      if (ownedTicketIds.length > 0) {
        await transaction.pieceJointe.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
        await transaction.compteRendu.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
        await transaction.historiqueStatut.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
        await transaction.ticket.deleteMany({ where: { id: { in: ownedTicketIds } } });
      }

      await transaction.historiqueStatut.deleteMany({ where: { auteurId: id } });
      await transaction.ticket.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await transaction.utilisateur.delete({ where: { id } });
    });

    try {
      await this.emailService.sendAccountNotification({
        recipientEmail: user.email,
        recipientName: `${user.prenom} ${user.nom}`,
        subject: "Your TicketFlow account was deleted",
        message: "An administrator deleted your TicketFlow account. You can no longer sign in with this account."
      });
    } catch {
      // The account is already deleted if email delivery is temporarily unavailable.
    }

    return { id, deleted: true };
  }
}