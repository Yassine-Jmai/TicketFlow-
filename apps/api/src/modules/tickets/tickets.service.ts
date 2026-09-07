import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { CreateCompteRenduDto } from "./dto/create-compte-rendu.dto";
import { StatutTicket } from "@prisma/client";

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

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
  async create(createTicketDto: CreateTicketDto, clientId: string) {
    const numero = await this.generateTicketNumber();

    // Verify module exists
    const module = await this.prisma.ticketModule.findUnique({
      where: { id: createTicketDto.moduleId },
    });

    if (!module) {
      throw new BadRequestException(`Module with ID ${createTicketDto.moduleId} not found`);
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        numero,
        objet: createTicketDto.objet,
        description: createTicketDto.description,
        priorite: createTicketDto.priorite,
        statut: StatutTicket.NOUVEAU,
        clientId,
        moduleId: createTicketDto.moduleId,
      },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
      },
    });

    return ticket;
  }

  /**
   * Get all tickets for a client
   */
  async getClientTickets(clientId: string) {
    return this.prisma.ticket.findMany({
      where: { clientId },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
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
  async getAssignedTickets(consultantId: string) {
    return this.prisma.ticket.findMany({
      where: { assigneeId: consultantId },
      include: {
        module: true,
        client: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        assignee: {
          select: { id: true, email: true, nom: true, prenom: true },
        },
        compteRendu: true,
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

  /**
   * Update ticket status
   * Rules:
   * - Can only move forward in workflow
   * - RESOLU requires a compte rendu
   * - CLOTURE is final
   */
  async updateStatus(
    ticketId: string,
    updateStatusDto: UpdateTicketStatusDto,
    authorId: string
  ) {
    const ticket = await this.getTicketById(ticketId);

    // Prevent modification after CLOTURE
    if (ticket.statut === StatutTicket.CLOTURE) {
      throw new BadRequestException("Cannot modify a closed ticket");
    }

    // If moving to RESOLU, check for compte rendu
    if (updateStatusDto.newStatus === StatutTicket.RESOLU) {
      const compteRendu = await this.prisma.compteRendu.findUnique({
        where: { ticketId },
      });

      if (!compteRendu) {
        throw new BadRequestException(
          "Cannot move to RESOLU status without a compte rendu (intervention report)"
        );
      }
    }

    // Create history record with previous status (can be null for first change)
    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        statut: updateStatusDto.newStatus,
        dateModification: new Date(),
      },
    });

    // Record status change in history
    await this.prisma.historiqueStatut.create({
      data: {
        ancienStatut: ticket.statut,
        nouveauStatut: updateStatusDto.newStatus,
        ticketId,
        auteurId: authorId,
      },
    });

    return this.getTicketById(ticketId);
  }

  /**
   * Create or update compte rendu for a ticket
   */
  async createOrUpdateCompteRendu(
    ticketId: string,
    createCompteRenduDto: CreateCompteRenduDto
  ) {
    // Verify ticket exists
    await this.getTicketById(ticketId);

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
  async assignTicket(ticketId: string, consultantId: string) {
    // Verify ticket exists
    await this.getTicketById(ticketId);

    // Verify consultant exists
    const consultant = await this.prisma.utilisateur.findUnique({
      where: { id: consultantId },
    });

    if (!consultant) {
      throw new NotFoundException(`Consultant with ID ${consultantId} not found`);
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
   * Add an attachment to a ticket
   * nomFichier: filename
   * chemin: file path (stored locally or cloud URL)
   * type: MIME type
   * taille: file size in bytes
   */
  async addAttachment(
    ticketId: string,
    nomFichier: string,
    chemin: string,
    type: string,
    taille: number
  ) {
    // Verify ticket exists
    await this.getTicketById(ticketId);

    const attachment = await this.prisma.pieceJointe.create({
      data: {
        nomFichier,
        chemin,
        type,
        taille,
        ticketId,
      },
    });

    return attachment;
  }

  /**
   * Get all attachments for a ticket
   */
  async getAttachments(ticketId: string) {
    // Verify ticket exists
    await this.getTicketById(ticketId);

    return this.prisma.pieceJointe.findMany({
      where: { ticketId },
      orderBy: { dateAjout: "desc" },
    });
  }

  /**
   * Delete an attachment
   */
  async deleteAttachment(attachmentId: string, ticketId: string) {
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

    return this.prisma.pieceJointe.delete({
      where: { id: attachmentId },
    });
  }
}
