import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createReadStream, existsSync, mkdirSync, unlinkSync } from "fs";
import { basename, extname, resolve } from "path";
import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { TicketsService, TicketActor } from "./tickets.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { CreateCompteRenduDto } from "./dto/create-compte-rendu.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { AssignTicketDto } from "./dto/assign-ticket.dto";

const multer = require("multer");

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const UPLOAD_DIRECTORY = resolve(process.cwd(), "uploads", "tickets");
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type UploadedTicketFile = {
  originalname: string;
  filename: string;
  path: string;
  mimetype: string;
  size: number;
};

/**
 * Tickets Controller
 * 
 * Endpoints for ticket management
 * Using test user: client_id and consultant_id from request headers
 * 
 * TODO: Replace with JWT middleware from Auth module
 */
@Controller("tickets")
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  private getCurrentUser(headers: Record<string, string | string[] | undefined>): TicketActor {
    const userIdHeader = headers["x-user-id"];
    const userRoleHeader = headers["x-user-role"];
    const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
    const userRole = Array.isArray(userRoleHeader)
      ? userRoleHeader[0]
      : userRoleHeader;

    if (!userId || !userRole) {
      throw new UnauthorizedException(
        "Temporary auth headers x-user-id and x-user-role are required"
      );
    }

    if (!Object.values(Role).includes(userRole as Role)) {
      throw new ForbiddenException("Invalid user role");
    }

    return {
      id: userId,
      role: userRole as Role,
    };
  }

  /**
   * POST /tickets
   * Create a new ticket
   * User: Client (authenticated)
   */
  @Post()
  async createTicket(
    @Body() createTicketDto: CreateTicketDto,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.create(
      createTicketDto,
      this.getCurrentUser(headers)
    );
  }

  /**
   * GET /tickets
   * Get all tickets
   * User: Administrator
   */
  @Get()
  async getAllTickets(
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getAllTickets(this.getCurrentUser(headers));
  }

  /**
   * GET /tickets/mine
   * Get all tickets for the connected client
   * User: Client (authenticated)
   */
  @Get("mine")
  async getMyTickets(
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getClientTickets(this.getCurrentUser(headers));
  }

  /**
   * GET /tickets/assigned
   * Get all tickets assigned to the connected consultant
   * User: Consultant (authenticated)
   */
  @Get("assigned")
  async getAssignedTickets(
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getAssignedTickets(this.getCurrentUser(headers));
  }

  /**
   * GET /tickets/:id/messages
   * Get the conversation for a ticket.
   */
  @Get(":id/messages")
  async getMessages(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getMessages(ticketId, this.getCurrentUser(headers));
  }

  /**
   * POST /tickets/:id/messages
   * Add a message to the conversation.
   */
  @Post(":id/messages")
  async createMessage(
    @Param("id") ticketId: string,
    @Body() createMessageDto: CreateMessageDto,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.createMessage(
      ticketId,
      createMessageDto,
      this.getCurrentUser(headers)
    );
  }

  /**
   * GET /tickets/:id/assignment-recommendations
   * Rank active consultants for an administrator without assigning automatically.
   */
  @Get(":id/assignment-recommendations")
  async getAssignmentRecommendations(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getAssignmentRecommendations(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * GET /tickets/:id
   * Get ticket details
   * User: Client or Consultant
   */
  @Get(":id")
  async getTicket(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getTicketForActor(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * PATCH /tickets/:id/statut
   * Update ticket status
   * User: Consultant or Administrator
   */
  @Patch(":id/statut")
  async updateStatus(
    @Param("id") ticketId: string,
    @Body() updateStatusDto: UpdateTicketStatusDto,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.updateStatus(
      ticketId,
      updateStatusDto.newStatus,
      this.getCurrentUser(headers)
    );
  }

  /**
   * PATCH /tickets/:id/assign
   * Assign a ticket to a consultant
   * User: Administrator
   */
  @Patch(":id/assign")
  async assignTicket(
    @Param("id") ticketId: string,
    @Body() assignTicketDto: AssignTicketDto,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.assignTicket(
      ticketId,
      assignTicketDto.consultantId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * PATCH /tickets/:id/unassign
   * Release a consultant from an unfinished ticket.
   * User: Administrator
   */
  @Patch(":id/unassign")
  async unassignTicket(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.unassignTicket(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * PATCH /tickets/:id/validate
   * Validate a resolved ticket and close it
   * User: Client
   */
  @Patch(":id/validate")
  async validateResolvedTicket(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.closeResolvedByClient(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * PATCH /tickets/:id/reject
   * Reject an incorrect resolution and reopen the ticket
   * User: Client
   */
  @Patch(":id/reject")
  async rejectResolvedTicket(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.rejectResolvedByClient(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * DELETE /tickets/:id
   * Delete a ticket
   * User: Administrator
   */
  @Delete(":id")
  async deleteTicket(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.deleteTicket(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * POST /tickets/:id/compte-rendu
   * Create or update intervention report
   * User: Consultant
   */
  @Post(":id/compte-rendu")
  async createCompteRendu(
    @Param("id") ticketId: string,
    @Body() createCompteRenduDto: CreateCompteRenduDto,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.createOrUpdateCompteRendu(
      ticketId,
      createCompteRenduDto,
      this.getCurrentUser(headers)
    );
  }

  /**
   * POST /tickets/:id/attachments
   * Add an attachment to a ticket
   * User: Client or Consultant
   */
  @Post(":id/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: multer.diskStorage({
        destination: (
          _request: unknown,
          _file: UploadedTicketFile,
          callback: (error: Error | null, destination: string) => void
        ) => {
          mkdirSync(UPLOAD_DIRECTORY, { recursive: true });
          callback(null, UPLOAD_DIRECTORY);
        },
        filename: (
          _request: unknown,
          file: UploadedTicketFile,
          callback: (error: Error | null, filename: string) => void
        ) => {
          const extension = extname(file.originalname).toLowerCase();
          const safeBaseName =
            basename(file.originalname, extension)
              .replace(/[^a-zA-Z0-9_-]/g, "_")
              .slice(0, 80) || "attachment";

          callback(null, `${randomUUID()}-${safeBaseName}${extension}`);
        },
      }),
      limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES,
      },
      fileFilter: (
        _request: unknown,
        file: UploadedTicketFile,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
          callback(new BadRequestException("Unsupported attachment type"), false);
          return;
        }

        callback(null, true);
      },
    })
  )
  async addAttachment(
    @Param("id") ticketId: string,
    @UploadedFile() file: UploadedTicketFile | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    if (!file) {
      throw new BadRequestException("Attachment file is required");
    }

    try {
      return await this.ticketsService.addAttachment(
        ticketId,
        file,
        this.getCurrentUser(headers)
      );
    } catch (error) {
      if (file.path && existsSync(file.path)) {
        unlinkSync(file.path);
      }

      throw error;
    }
  }

  /**
   * GET /tickets/:id/attachments
   * Get all attachments for a ticket
   * User: Client or Consultant
   */
  @Get(":id/attachments")
  async getAttachments(
    @Param("id") ticketId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.getAttachments(
      ticketId,
      this.getCurrentUser(headers)
    );
  }

  /**
   * GET /tickets/:id/attachments/:attachmentId/download
   * Download an attachment
   * User: Client or Consultant
   */
  @Get(":id/attachments/:attachmentId/download")
  async downloadAttachment(
    @Param("id") ticketId: string,
    @Param("attachmentId") attachmentId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res({ passthrough: true }) response: any
  ) {
    const attachment = await this.ticketsService.getAttachmentForDownload(
      attachmentId,
      ticketId,
      this.getCurrentUser(headers)
    );

    if (!existsSync(attachment.chemin)) {
      throw new NotFoundException("Stored attachment file not found");
    }

    const filename = basename(attachment.nomFichier).replace(/"/g, "");

    response.set({
      "Content-Type": attachment.type,
      "Content-Length": attachment.taille,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });

    return new StreamableFile(createReadStream(attachment.chemin));
  }

  /**
   * DELETE /tickets/:id/attachments/:attachmentId
   * Delete an attachment
   * User: Client or Consultant
   */
  @Delete(":id/attachments/:attachmentId")
  async deleteAttachment(
    @Param("id") ticketId: string,
    @Param("attachmentId") attachmentId: string,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    return this.ticketsService.deleteAttachment(
      attachmentId,
      ticketId,
      this.getCurrentUser(headers)
    );
  }
}
