import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { CreateCompteRenduDto } from "./dto/create-compte-rendu.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { Role, StatutTicket } from "@prisma/client";
import { existsSync, unlinkSync } from "fs";
import { EmailService } from "../email/email.service";
import {
  AssignmentAdvisorCandidate,
  AssignmentAdvisorService,
} from "../ai/assignment-advisor.service";

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
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private assignmentAdvisor: AssignmentAdvisorService
  ) {}

  private clampScore(value: number) {
    return Math.max(0, Math.min(100, value));
  }

  private async notifyClientOfStatusChange(
    ticket: {
      numero: string;
      objet: string;
      client: { email: string; nom: string; prenom: string };
      assignee?: { nom: string; prenom: string } | null;
      compteRendu?: { contenu: string } | null;
    },
    newStatus: StatutTicket,
    changedAt: Date,
    closureReason?: "CLIENT_VALIDATION" | "ADMINISTRATOR" | "AUTOMATIC",
    clientResponseReceived = false,
    clientRejectedResolution = false
  ): Promise<boolean> {
    try {
      await this.emailService.sendTicketStatusNotification({
        recipientEmail: ticket.client.email,
        recipientName: `${ticket.client.prenom} ${ticket.client.nom}`.trim(),
        ticketNumber: ticket.numero,
        ticketSubject: ticket.objet,
        newStatus,
        changedAt,
        consultantName: ticket.assignee
          ? `${ticket.assignee.prenom} ${ticket.assignee.nom}`.trim()
          : null,
        report: ticket.compteRendu?.contenu,
        closureReason,
        clientResponseReceived,
        clientRejectedResolution
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Status email for ticket ${ticket.numero} could not be sent: ${message}`
      );
      return false;
    }
  }

  private async notifyStaffOfClientClosure(
    ticket: {
      numero: string;
      objet: string;
      client: { email: string; nom: string; prenom: string };
      assignee?: { email: string; nom: string; prenom: string } | null;
    },
    closedAt: Date
  ) {
    const administrators = await this.prisma.utilisateur.findMany({
      where: { role: Role.ADMINISTRATEUR, deletedAt: null },
      select: { email: true, nom: true, prenom: true }
    });
    const recipients = [
      ...(ticket.assignee ? [ticket.assignee] : []),
      ...administrators
    ];
    const uniqueRecipients = Array.from(
      new Map(
        recipients.map((recipient) => [recipient.email.toLowerCase(), recipient])
      ).values()
    );
    let sent = 0;

    await Promise.all(
      uniqueRecipients.map(async (recipient) => {
        try {
          await this.emailService.sendTicketClosureStaffNotification({
            recipientEmail: recipient.email,
            recipientName: `${recipient.prenom} ${recipient.nom}`.trim(),
            ticketNumber: ticket.numero,
            ticketSubject: ticket.objet,
            clientName: `${ticket.client.prenom} ${ticket.client.nom}`.trim(),
            closedAt
          });
          sent += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Closure email for ticket ${ticket.numero} to ${recipient.email} could not be sent: ${message}`
          );
        }
      })
    );

    return { sent, total: uniqueRecipients.length };
  }

  private async notifyStaffOfClientRejection(
    ticket: {
      numero: string;
      objet: string;
      client: { email: string; nom: string; prenom: string };
      assignee?: { email: string; nom: string; prenom: string } | null;
    },
    rejectedAt: Date
  ) {
    const administrators = await this.prisma.utilisateur.findMany({
      where: { role: Role.ADMINISTRATEUR, deletedAt: null },
      select: { email: true, nom: true, prenom: true }
    });
    const recipients = [
      ...(ticket.assignee ? [ticket.assignee] : []),
      ...administrators
    ];
    const uniqueRecipients = Array.from(
      new Map(
        recipients.map((recipient) => [recipient.email.toLowerCase(), recipient])
      ).values()
    );
    let sent = 0;

    await Promise.all(
      uniqueRecipients.map(async (recipient) => {
        try {
          await this.emailService.sendTicketRejectionStaffNotification({
            recipientEmail: recipient.email,
            recipientName: `${recipient.prenom} ${recipient.nom}`.trim(),
            ticketNumber: ticket.numero,
            ticketSubject: ticket.objet,
            clientName: `${ticket.client.prenom} ${ticket.client.nom}`.trim(),
            rejectedAt
          });
          sent += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Rejection email for ticket ${ticket.numero} to ${recipient.email} could not be sent: ${message}`
          );
        }
      })
    );

    return { sent, total: uniqueRecipients.length };
  }

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

  private ensureTicketIsMutable(status: StatutTicket, archivedAt?: Date | null) {
    if (archivedAt) {
      throw new BadRequestException("An archived ticket cannot be changed");
    }

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
      where: { archivedAt: null },
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
      where: { clientId: actor.id, archivedAt: null },
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
      where: { assigneeId: actor.id, archivedAt: null },
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

    if (ticket.archivedAt && actor.role !== Role.ADMINISTRATEUR) {
      throw new NotFoundException("Ticket not found");
    }

    return ticket;
  }

  async getAssignmentRecommendations(ticketId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.ADMINISTRATEUR]);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        objet: true,
        description: true,
        priorite: true,
        statut: true,
        archivedAt: true,
        moduleId: true,
        module: { select: { nom: true } },
      },
    });

    if (!ticket || ticket.archivedAt) {
      throw new NotFoundException("Ticket not found");
    }

    if (ticket.statut === StatutTicket.CLOTURE) {
      throw new BadRequestException("A closed ticket cannot be assigned");
    }

    const consultants = await this.prisma.utilisateur.findMany({
      where: { role: Role.CONSULTANT, deletedAt: null },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        ticketsAssigne: {
          select: {
            id: true,
            objet: true,
            description: true,
            moduleId: true,
            module: { select: { nom: true } },
            statut: true,
            dateCreation: true,
            dateCloture: true,
            archivedAt: true,
          },
          orderBy: { dateModification: "desc" },
        },
      },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    });

    if (consultants.length === 0) {
      return {
        aiEnhanced: false,
        model: null,
        summary: "Aucun consultant actif n'est disponible pour ce ticket.",
        requiredSkills: [ticket.module.nom],
        recommendations: [],
      };
    }

    const completedStatuses = new Set<StatutTicket>([
      StatutTicket.RESOLU,
      StatutTicket.CLOTURE,
    ]);
    const activeStatuses = new Set<StatutTicket>([
      StatutTicket.NOUVEAU,
      StatutTicket.EN_COURS,
      StatutTicket.EN_ATTENTE_CLIENT,
    ]);
    const activeCounts = consultants.map((consultant) =>
      consultant.ticketsAssigne.filter(
        (assignedTicket) =>
          !assignedTicket.archivedAt && activeStatuses.has(assignedTicket.statut)
      ).length
    );
    const estimatedCapacity = Math.max(
      3,
      Math.ceil(activeCounts.reduce((sum, count) => sum + count, 0) / consultants.length) + 2
    );

    const candidates = consultants.map((consultant, index) => {
      const historicalTickets = consultant.ticketsAssigne.filter(
        (assignedTicket) => assignedTicket.id !== ticket.id
      );
      const completedTickets = historicalTickets.filter((assignedTicket) =>
        completedStatuses.has(assignedTicket.statut)
      );
      const sameModuleTickets = historicalTickets.filter(
        (assignedTicket) => assignedTicket.moduleId === ticket.moduleId
      );
      const sameModuleCompletedTickets = sameModuleTickets.filter((assignedTicket) =>
        completedStatuses.has(assignedTicket.statut)
      );
      const completionRate = historicalTickets.length
        ? (completedTickets.length / historicalTickets.length) * 100
        : 50;
      const sameModuleCompletionRate = sameModuleTickets.length
        ? (sameModuleCompletedTickets.length / sameModuleTickets.length) * 100
        : 0;
      const resolutionDurations = completedTickets
        .filter((assignedTicket) => assignedTicket.dateCloture)
        .map(
          (assignedTicket) =>
            (assignedTicket.dateCloture!.getTime() - assignedTicket.dateCreation.getTime()) /
            3_600_000
        )
        .filter((duration) => duration >= 0);
      const averageResolutionHours = resolutionDurations.length
        ? resolutionDurations.reduce((sum, duration) => sum + duration, 0) /
          resolutionDurations.length
        : null;
      const activeTickets = activeCounts[index];
      const expertiseScore = sameModuleTickets.length
        ? this.clampScore(
            35 +
              Math.min(40, sameModuleCompletedTickets.length * 10) +
              sameModuleCompletionRate * 0.25
          )
        : 35;
      const workloadScore = this.clampScore(
        100 - (activeTickets / estimatedCapacity) * 100
      );
      const speedScore = averageResolutionHours === null
        ? 50
        : this.clampScore(100 - (averageResolutionHours / (24 * 14)) * 80);
      const baselineScore = Math.round(
        expertiseScore * 0.4 +
          workloadScore * 0.25 +
          completionRate * 0.2 +
          speedScore * 0.15
      );
      const reasons = [
        sameModuleCompletedTickets.length
          ? `${sameModuleCompletedTickets.length} ticket(s) déjà résolu(s) dans ${ticket.module.nom}`
          : `Pas encore d'historique résolu dans ${ticket.module.nom}`,
        `${activeTickets} ticket(s) actif(s) sur une capacité estimée à ${estimatedCapacity}`,
        historicalTickets.length
          ? `Taux de résolution historique de ${Math.round(completionRate)} %`
          : "Nouveau profil sans historique de traitement",
      ];
      const warnings = [
        ...(activeTickets >= estimatedCapacity
          ? ["Charge active actuellement élevée"]
          : []),
        ...(sameModuleTickets.length === 0
          ? ["Aucune expérience historique sur ce module"]
          : []),
      ];

      const advisorCandidate: AssignmentAdvisorCandidate = {
        consultantId: consultant.id,
        baselineScore,
        activeTickets,
        completedTickets: completedTickets.length,
        sameModuleTickets: sameModuleTickets.length,
        sameModuleCompletedTickets: sameModuleCompletedTickets.length,
        completionRate: Math.round(completionRate),
        averageResolutionHours:
          averageResolutionHours === null ? null : Math.round(averageResolutionHours),
        recentCompletedTickets: completedTickets.slice(0, 5).map((completedTicket) => ({
          subject: completedTicket.objet.slice(0, 180),
          description: completedTicket.description.slice(0, 600),
          module: completedTicket.module.nom,
        })),
      };

      return {
        consultant: {
          id: consultant.id,
          nom: consultant.nom,
          prenom: consultant.prenom,
          email: consultant.email,
        },
        baselineScore,
        reasons,
        warnings,
        metrics: {
          activeTickets,
          completedTickets: completedTickets.length,
          sameModuleCompletedTickets: sameModuleCompletedTickets.length,
          completionRate: Math.round(completionRate),
          averageResolutionHours:
            averageResolutionHours === null ? null : Math.round(averageResolutionHours),
        },
        advisorCandidate,
      };
    });

    const aiAnalysis = await this.assignmentAdvisor.analyze(
      {
        subject: ticket.objet.slice(0, 240),
        description: ticket.description.slice(0, 2_000),
        module: ticket.module.nom,
        priority: ticket.priorite,
      },
      candidates.map((candidate) => candidate.advisorCandidate)
    );
    const aiRankingByConsultant = new Map(
      aiAnalysis?.rankings.map((ranking) => [ranking.consultantId, ranking]) ?? []
    );

    const recommendations = candidates
      .map((candidate) => {
        const aiRanking = aiRankingByConsultant.get(candidate.consultant.id);
        const score = aiRanking
          ? Math.round(candidate.baselineScore * 0.6 + aiRanking.fitScore * 0.4)
          : candidate.baselineScore;

        return {
          consultant: candidate.consultant,
          score,
          baselineScore: candidate.baselineScore,
          aiFitScore: aiRanking ? Math.round(aiRanking.fitScore) : null,
          reasons: aiRanking
            ? [...aiRanking.reasons.slice(0, 2), ...candidate.reasons.slice(0, 2)]
            : candidate.reasons,
          warnings: aiRanking
            ? [...aiRanking.warnings, ...candidate.warnings].slice(0, 3)
            : candidate.warnings,
          metrics: candidate.metrics,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    return {
      aiEnhanced: Boolean(aiAnalysis),
      model: aiAnalysis?.model ?? null,
      summary: aiAnalysis?.summary ||
        "Classement calculé à partir de l'expérience par module, de la charge active et des résultats historiques.",
      requiredSkills: aiAnalysis?.requiredSkills.length
        ? aiAnalysis.requiredSkills
        : [ticket.module.nom],
      recommendations,
    };
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
      include: {
        client: { select: { email: true, nom: true, prenom: true } },
        assignee: { select: { email: true, nom: true, prenom: true } },
        compteRendu: { select: { contenu: true } }
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);
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

    const changedAt = new Date();
    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          statut: newStatus,
          dateModification: changedAt,
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

    const notificationSent = await this.notifyClientOfStatusChange(
      ticket,
      newStatus,
      changedAt
    );
    return { ...updatedTicket, notificationSent };
  }

  async closeResolvedByClient(ticketId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.CLIENT]);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        client: { select: { email: true, nom: true, prenom: true } },
        assignee: { select: { email: true, nom: true, prenom: true } },
        compteRendu: { select: { contenu: true } }
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);

    if (ticket.statut !== StatutTicket.RESOLU) {
      throw new BadRequestException(
        "Only a resolved ticket can be closed by the client"
      );
    }

    this.validateStatusTransition(ticket.statut, StatutTicket.CLOTURE);

    const closedAt = new Date();

    const updatedTicket = await this.prisma.$transaction(async (tx) => {
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

    const clientNotificationSent = await this.notifyClientOfStatusChange(
      ticket,
      StatutTicket.CLOTURE,
      closedAt,
      "CLIENT_VALIDATION"
    );
    const staffNotifications = await this.notifyStaffOfClientClosure(
      ticket,
      closedAt
    );
    return {
      ...updatedTicket,
      clientNotificationSent,
      staffNotificationsSent: staffNotifications.sent,
      staffNotificationRecipients: staffNotifications.total
    };
  }

  async rejectResolvedByClient(ticketId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.CLIENT]);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        client: { select: { email: true, nom: true, prenom: true } },
        assignee: { select: { email: true, nom: true, prenom: true } },
        compteRendu: { select: { contenu: true } }
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);

    if (ticket.statut !== StatutTicket.RESOLU) {
      throw new BadRequestException(
        "Only a resolved ticket can be rejected by the client"
      );
    }

    const rejectedAt = new Date();
    const updatedTicket = await this.prisma.$transaction(async (tx) => {
      const updatedTicket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          statut: StatutTicket.EN_COURS,
          dateModification: rejectedAt,
          dateCloture: null
        }
      });

      await tx.historiqueStatut.create({
        data: {
          ticketId: ticket.id,
          ancienStatut: StatutTicket.RESOLU,
          auteurId: actor.id,
          nouveauStatut: StatutTicket.EN_COURS,
          dateChangement: rejectedAt
        }
      });

      return updatedTicket;
    });

    const clientNotificationSent = await this.notifyClientOfStatusChange(
      ticket,
      StatutTicket.EN_COURS,
      rejectedAt,
      undefined,
      false,
      true
    );
    const staffNotifications = await this.notifyStaffOfClientRejection(
      ticket,
      rejectedAt
    );

    return {
      ...updatedTicket,
      clientNotificationSent,
      staffNotificationsSent: staffNotifications.sent,
      staffNotificationRecipients: staffNotifications.total
    };
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
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);

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

  async getMessages(ticketId: string, actor: TicketActor) {
    await this.getTicketForActor(ticketId, actor);

    return this.prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { dateCreation: "asc" },
      include: {
        auteur: {
          select: { id: true, email: true, nom: true, prenom: true, role: true },
        },
      },
    });
  }

  async createMessage(
    ticketId: string,
    createMessageDto: CreateMessageDto,
    actor: TicketActor
  ) {
    const ticket = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticket, actor);
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);

    return this.prisma.ticketMessage.create({
      data: {
        contenu: createMessageDto.contenu.trim(),
        auteurId: actor.id,
        ticketId,
      },
      include: {
        auteur: {
          select: { id: true, email: true, nom: true, prenom: true, role: true },
        },
      },
    });
  }

  /**
   * Assign a ticket to a consultant
   */
  async assignTicket(ticketId: string, consultantId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.ADMINISTRATEUR]);

    const ticketToAssign = await this.getTicketById(ticketId);
    this.ensureTicketAccess(ticketToAssign, actor);
    this.ensureTicketIsMutable(ticketToAssign.statut, ticketToAssign.archivedAt);

    // Verify consultant exists
    const consultant = await this.prisma.utilisateur.findUnique({
      where: { id: consultantId },
    });

    if (!consultant || consultant.deletedAt) {
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
   * Archive an active ticket while preserving its complete audit history.
   */
  async deleteTicket(ticketId: string, actor: TicketActor) {
    this.ensureRole(actor, [Role.ADMINISTRATEUR]);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    if (ticket.statut === StatutTicket.CLOTURE) {
      throw new BadRequestException(
        "A closed ticket cannot be deleted or archived"
      );
    }

    if (ticket.archivedAt) {
      throw new BadRequestException("Ticket is already archived");
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { archivedAt: new Date() }
    });
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
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);

    const shouldReturnToInProgress =
      actor.role === Role.CLIENT && ticket.statut === StatutTicket.EN_ATTENTE_CLIENT;
    const clientResponseAt = new Date();

    const attachment = await this.prisma.$transaction(async (tx) => {
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
        await tx.ticket.update({
          where: { id: ticketId },
          data: {
            statut: StatutTicket.EN_COURS,
            dateModification: clientResponseAt,
          },
        });

        await tx.historiqueStatut.create({
          data: {
            ticketId,
            ancienStatut: StatutTicket.EN_ATTENTE_CLIENT,
            nouveauStatut: StatutTicket.EN_COURS,
            auteurId: actor.id,
            dateChangement: clientResponseAt,
          },
        });
      }

      return attachment;
    });

    if (shouldReturnToInProgress) {
      await this.notifyClientOfStatusChange(
        ticket,
        StatutTicket.EN_COURS,
        clientResponseAt,
        undefined,
        true
      );
    }

    return attachment;
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
    this.ensureTicketIsMutable(ticket.statut, ticket.archivedAt);

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
      where: { role: Role.ADMINISTRATEUR, deletedAt: null },
      orderBy: { dateCreation: "asc" },
    });

    if (!systemAuthor) {
      return 0;
    }

    const ticketsToClose = await this.prisma.ticket.findMany({
      where: {
        statut: StatutTicket.RESOLU,
        archivedAt: null,
        dateModification: {
          lte: cutoffDate,
        },
      },
      select: {
        id: true,
        statut: true,
        numero: true,
        objet: true,
        client: { select: { email: true, nom: true, prenom: true } },
        assignee: { select: { nom: true, prenom: true } },
        compteRendu: { select: { contenu: true } }
      },
    });

    if (ticketsToClose.length === 0) {
      return 0;
    }

    const closedTicketIds = await this.prisma.$transaction(async (tx) => {
      const closedIds: string[] = [];

      for (const ticket of ticketsToClose) {
        const closeResult = await tx.ticket.updateMany({
          where: {
            id: ticket.id,
            statut: StatutTicket.RESOLU
          },
          data: {
            statut: StatutTicket.CLOTURE,
            dateCloture: closureDate,
            dateModification: closureDate
          }
        });

        if (closeResult.count === 0) continue;

        await tx.historiqueStatut.create({
          data: {
            ticketId: ticket.id,
            ancienStatut: ticket.statut,
            nouveauStatut: StatutTicket.CLOTURE,
            auteurId: systemAuthor.id,
            dateChangement: closureDate
          }
        });
        closedIds.push(ticket.id);
      }

      return closedIds;
    });

    const closedTickets = ticketsToClose.filter((ticket) =>
      closedTicketIds.includes(ticket.id)
    );
    await Promise.all(
      closedTickets.map((ticket) =>
        this.notifyClientOfStatusChange(
          ticket,
          StatutTicket.CLOTURE,
          closureDate,
          "AUTOMATIC"
        )
      )
    );

    return closedTicketIds.length;
  }
}
