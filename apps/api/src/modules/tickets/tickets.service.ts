import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateCompteRenduDto } from "./dto/create-compte-rendu.dto";
import { Role, StatutTicket } from "@prisma/client";
import { existsSync, unlinkSync } from "fs";

const ALLOWED_STATUS_TRANSITIONS: Record<StatutTicket, StatutTicket[]> = {
  [StatutTicket.NOUVEAU]: [StatutTicket.EN_COURS],
  [StatutTicket.EN_COURS]: [StatutTicket.EN_ATTENTE_CLIENT, StatutTicket.RESOLU],
  [StatutTicket.EN_ATTENTE_CLIENT]: [StatutTicket.EN_COURS],
  [StatutTicket.RESOLU]: [StatutTicket.CLOTURE],
  [StatutTicket.CLOTURE]: [],
};

type UploadedTicketFile = {
  originalname: string;
  path: string;
  mimetype: string;
  size: number;
};

export type TicketActor = {
  id: string;
  role: Role;
};

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  private validateStatusTransition(
    currentStatus: StatutTicket,
    newStatus: StatutTicket
  ) {
    if (currentStatus === StatutTicket.CLOTURE) {
      throw new BadRequestException("A closed ticket cannot be changed");
    }

    const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus];

    if (!allowedNextStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} -> ${newStatus}`
      );
    }
  }

  private ensureTicketIsMutable(status: StatutTicket) {
    if (status === StatutTicket.CLOTURE) {
      throw new BadRequestException("A closed ticket cannot be changed");
    }
  }

  private ensureRole(actor: TicketActor, allowedRoles: Role[]) {
    if (!allowedRoles.includes(actor.role)) {
      throw new ForbiddenException("You are not allowed to perform this action");
    }
  }

  private ensureTicketAccess(
    ticket: { clientId: string; assigneeId: string | null },
    actor: TicketActor
  ) {
    if (actor.role === Role.ADMINISTRATEUR) {
      return;
    }

    if (actor.role === Role.CLIENT && ticket.clientId === actor.id) {
      return;
    }

    if (actor.role === Role.CONSULTANT && ticket.assigneeId === actor.id) {
      return;
    }

    throw new ForbiddenException("You do not have access to this ticket");
  }

  /**
   * Generate a unique ticket number
   * Format: TICK-YYYYMMDD-XXXXX
   */
  private async generateTicketNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Find all tickets created today
    const count = await this.prisma.ticket.count({
      where: {
        numero: {
          startsWith: `TICK-${dateStr}`,
        },
      },
    });

    return `TICK-${dateStr}-${String(count + 1).padStart(5, "0")}`;
  }

  /**
   * Create a new ticket
   */
  async create(createTicketDto: CreateTicketDto, actor: TicketActor) {
    this.ensureRole(actor, [Role.CLIENT]);

    const numero = await this.generateTicketNumber();

    // Verify module exists
    const module = await this.prisma.ticketModule.findUnique({
      where: { id: createTicketDto.moduleId },
    });

    if (!module) {
      throw new BadRequestException(`Module with ID ${createTicketDto.moduleId} not found`);
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const createdTicket = await tx.ticket.create({
        data: {
          numero,
          objet: createTicketDto.objet,
          description: createTicketDto.description,
          priorite: createTicketDto.priorite,
          statut: StatutTicket.NOUVEAU,
          clientId: actor.id,
          moduleId: createTicketDto.moduleId,
        },
        include: {
          module: true,
          client: {
            select: { id: true, email: true, nom: true, prenom: true },
          },
        },
      });

      await tx.historiqueStatut.create({
        data: {
          ticketId: createdTicket.id,
          ancienStatut: null,
          nouveauStatut: StatutTicket.NOUVEAU,
          auteurId: actor.id,
        },
      });

      return createdTicket;
    });

    return ticket;
  }

  /**
   * Get all tickets for administrators.
   */
  async getAllTickets(actor: TicketActor) {
    this.ensureRole(actor, [Role.ADMINISTRATEUR]);

    return this.prisma.ticket.findMany({
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        compteRendu: true,
        pieceJointes: {
          orderBy: { dateAjout: "desc" },
        },
        historiques: {
          orderBy: { dateChangement: "desc" },
          include: {
            auteur: {
              select: { id: true, email: true, nom: true, prenom: true },
            },
          },
        },
      },
      orderBy: { dateCreation: "desc" },
    });
  }

  /**
   * Get all tickets for a client
   */
  async getClientTickets(actor: TicketActor) {
    this.ensureRole(actor, [Role.CLIENT]);

    return this.prisma.ticket.findMany({
      where: { clientId: actor.id },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        compteRendu: true,
        pieceJointes: {
          orderBy: { dateAjout: "desc" },
        },
        historiques: {
          orderBy: { dateChangement: "desc" },
          include: {
            auteur: {
              select: { id: true, email: true, nom: true, prenom: true },
            },
          },
        },
      },
      orderBy: { dateCreation: "desc" },
    });
  }

  /**
   * Get all tickets assigned to a consultant
   */
  async getAssignedTickets(actor: TicketActor) {
    this.ensureRole(actor, [Role.CONSULTANT]);

    return this.prisma.ticket.findMany({
      where: { assigneeId: actor.id },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        compteRendu: true,
        pieceJointes: {
          orderBy: { dateAjout: "desc" },
        },
        historiques: {
          orderBy: { dateChangement: "desc" },
          include: {
            auteur: {
              select: { id: true, email: true, nom: true, prenom: true },
            },
          },
        },
      },
      orderBy: { dateCreation: "desc" },
    });
  }

  /**
   * Get a single ticket by ID
   */
  async getTicketById(ticketId: string, clientId?: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        compteRendu: true,
        pieceJointes: {
          orderBy: { dateAjout: "desc" },
        },
        historiques: {
          orderBy: { dateChangement: "desc" },
          include: {
            auteur: {
              select: { id: true, email: true, nom: true, prenom: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    // If clientId is provided, verify access
    if (clientId && ticket.clientId !== clientId) {
      throw new BadRequestException("You do not have access to this ticket");
    }

    return ticket;
  }

  async getTicketForActor(ticketId: string, actor: TicketActor) {
    const ticket = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticket, actor);

    return ticket;
  }

  /**
   * Update ticket status with the strict workflow rules.
   */
  async updateStatus(
    ticketId: string,
    newStatus: StatutTicket,
    actor: TicketActor
  ) {
    this.ensureRole(actor, [Role.CONSULTANT]);

    if (newStatus === StatutTicket.CLOTURE) {
      throw new BadRequestException(
        "A resolved ticket must be closed by client validation"
      );
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    this.ensureTicketAccess(ticket, actor);
    this.validateStatusTransition(ticket.statut, newStatus);

    if (
      newStatus === StatutTicket.EN_ATTENTE_CLIENT ||
      newStatus === StatutTicket.RESOLU
    ) {
      const report = await this.prisma.compteRendu.findFirst({
        where: {
          ticketId: ticket.id,
        },
      });

      if (!report) {
        throw new BadRequestException(
          newStatus === StatutTicket.EN_ATTENTE_CLIENT
            ? "An intervention report is required before requesting client information"
            : "An intervention report is required before resolving the ticket"
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          statut: newStatus,
          dateModification: new Date(),
        },
      });

      await tx.historiqueStatut.create({
        data: {
          ticketId: ticket.id,
          ancienStatut: ticket.statut,
          auteurId: actor.id,
          nouveauStatut: newStatus,
        },
      });

      return updatedTicket;
    });
  }

  async closeResolvedByClient(ticketId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.CLIENT]);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    this.ensureTicketAccess(ticket, actor);

    if (ticket.statut !== StatutTicket.RESOLU) {
      throw new BadRequestException(
        "Only a resolved ticket can be closed by the client"
      );
    }

    this.validateStatusTransition(ticket.statut, StatutTicket.CLOTURE);

    const closedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          statut: StatutTicket.CLOTURE,
          dateModification: closedAt,
          dateCloture: closedAt,
        },
      });

      await tx.historiqueStatut.create({
        data: {
          ticketId: ticket.id,
          ancienStatut: ticket.statut,
          auteurId: actor.id,
          nouveauStatut: StatutTicket.CLOTURE,
        },
      });

      return updatedTicket;
    });
  }

  /**
   * Create or update compte rendu for a ticket
   */
  async createOrUpdateCompteRendu(
    ticketId: string,
    createCompteRenduDto: CreateCompteRenduDto,
    actor: TicketActor
  ) {
    this.ensureRole(actor, [Role.CONSULTANT]);

    const ticket = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut);

    const compteRendu = await this.prisma.compteRendu.upsert({
      where: { ticketId },
      update: {
        contenu: createCompteRenduDto.contenu,
        dateModification: new Date(),
      },
      create: {
        ticketId,
        contenu: createCompteRenduDto.contenu,
      },
      include: {
        ticket: true,
      },
    });

    return compteRendu;
  }

  /**
   * Assign a ticket to a consultant
   */
  async assignTicket(ticketId: string, consultantId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.ADMINISTRATEUR]);

    const ticketToAssign = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticketToAssign, actor);
    this.ensureTicketIsMutable(ticketToAssign.statut);

    // Verify consultant exists
    const consultant = await this.prisma.utilisateur.findUnique({
      where: { id: consultantId },
    });

    if (!consultant) {
      throw new NotFoundException(`Consultant with ID ${consultantId} not found`);
    }

    if (consultant.role !== Role.CONSULTANT) {
      throw new BadRequestException("Selected user must have the CONSULTANT role");
    }

    const ticket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        assigneeId: consultantId,
        dateModification: new Date(),
      },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
      },
    });

    return ticket;
  }

  /**
   * Delete a ticket and all dependent records.
   */
  async deleteTicket(ticketId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.ADMINISTRATEUR]);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        pieceJointes: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    const deletedTicket = await this.prisma.$transaction(async (tx) => {
      await tx.historiqueStatut.deleteMany({ where: { ticketId } });
      await tx.compteRendu.deleteMany({ where: { ticketId } });
      await tx.pieceJointe.deleteMany({ where: { ticketId } });

      return tx.ticket.delete({
        where: { id: ticketId },
      });
    });

    for (const attachment of ticket.pieceJointes) {
      try {
        if (existsSync(attachment.chemin)) {
          unlinkSync(attachment.chemin);
        }
      } catch {
        // The ticket is already deleted; stale file cleanup can be retried manually.
      }
    }

    return deletedTicket;
  }

  /**
   * Add an attachment to a ticket
   */
  async addAttachment(
    ticketId: string,
    file: UploadedTicketFile,
    actor: TicketActor
  ) {
    this.ensureRole(actor, [Role.CLIENT, Role.CONSULTANT, Role.ADMINISTRATEUR]);

    const ticket = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut);

    const shouldReturnToInProgress =
      actor.role === Role.CLIENT && ticket.statut === StatutTicket.EN_ATTENTE_CLIENT;

    return this.prisma.$transaction(async (tx) => {
      const attachment = await tx.pieceJointe.create({
        data: {
          nomFichier: file.originalname,
          chemin: file.path,
          type: file.mimetype,
          taille: file.size,
          ticketId,
        },
      });

      if (shouldReturnToInProgress) {
        const responseDate = new Date();

        await tx.ticket.update({
          where: { id: ticketId },
          data: {
            statut: StatutTicket.EN_COURS,
            dateModification: responseDate,
          },
        });

        await tx.historiqueStatut.create({
          data: {
            ticketId,
            ancienStatut: StatutTicket.EN_ATTENTE_CLIENT,
            nouveauStatut: StatutTicket.EN_COURS,
            auteurId: actor.id,
            dateChangement: responseDate,
          },
        });
      }

      return attachment;
    });
  }

  /**
   * Get all attachments for a ticket
   */
  async getAttachments(ticketId: string, actor: TicketActor) {
    await this.getTicketForActor(ticketId, actor);

    return this.prisma.pieceJointe.findMany({
      where: { ticketId },
      orderBy: { dateAjout: "desc" },
    });
  }

  async getAttachmentForDownload(
    attachmentId: string,
    ticketId: string,
    actor: TicketActor
  ) {
    await this.getTicketForActor(ticketId, actor);

    const attachment = await this.prisma.pieceJointe.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
    }

    if (attachment.ticketId !== ticketId) {
      throw new BadRequestException("Attachment does not belong to this ticket");
    }

    return attachment;
  }

  /**
   * Delete an attachment
   */
  async deleteAttachment(
    attachmentId: string,
    ticketId: string,
    actor: TicketActor
  ) {
    this.ensureRole(actor, [Role.CLIENT, Role.CONSULTANT, Role.ADMINISTRATEUR]);

    const ticket = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut);

    // Verify attachment belongs to ticket
    const attachment = await this.prisma.pieceJointe.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
    }

    if (attachment.ticketId !== ticketId) {
      throw new BadRequestException("Attachment does not belong to this ticket");
    }

    const deletedAttachment = await this.prisma.pieceJointe.delete({
      where: { id: attachmentId },
    });

    try {
      if (existsSync(deletedAttachment.chemin)) {
        unlinkSync(deletedAttachment.chemin);
      }
    } catch {
      // The attachment record is already deleted; stale file cleanup can be retried manually.
    }

    return deletedAttachment;
  }

  async closeResolvedTicketsOlderThan(days: number) {
    const closureDate = new Date();
    const cutoffDate = new Date(closureDate);
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const systemAuthor = await this.prisma.utilisateur.findFirst({
      where: { role: Role.ADMINISTRATEUR },
      orderBy: { dateCreation: "asc" },
    });

    if (!systemAuthor) {
      return 0;
    }

    const ticketsToClose = await this.prisma.ticket.findMany({
      where: {
        statut: StatutTicket.RESOLU,
        dateModification: {
          lte: cutoffDate,
        },
      },
      select: {
        id: true,
        statut: true,
      },
    });

    if (ticketsToClose.length === 0) {
      return 0;
    }

    return this.prisma.$transaction(async (tx) => {
      const closeResult = await tx.ticket.updateMany({
        where: {
          id: {
            in: ticketsToClose.map((ticket) => ticket.id),
          },
          statut: StatutTicket.RESOLU,
        },
        data: {
          statut: StatutTicket.CLOTURE,
          dateCloture: closureDate,
          dateModification: closureDate,
        },
      });

      if (closeResult.count > 0) {
        await tx.historiqueStatut.createMany({
          data: ticketsToClose.map((ticket) => ({
            ticketId: ticket.id,
            ancienStatut: ticket.statut,
            nouveauStatut: StatutTicket.CLOTURE,
            auteurId: systemAuthor.id,
            dateChangement: closureDate,
          })),
        });
      }

      return closeResult.count;
    });
  }
}
