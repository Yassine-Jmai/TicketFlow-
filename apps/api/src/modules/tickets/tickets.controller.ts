import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  BadRequestException,
} from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { CreateCompteRenduDto } from "./dto/create-compte-rendu.dto";
import { CreatePieceJointeDto } from "./dto/create-piece-jointe.dto";

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

  /**
   * POST /tickets
   * Create a new ticket
   * User: Client (authenticated)
   */
  @Post()
  async createTicket(
    @Body() createTicketDto: CreateTicketDto
  ) {
    // TODO: Replace with req.user.id from JWT
    const testClientId = "0d1fc0c3-81ce-4d83-a47d-bac610493ffd";
    return this.ticketsService.create(createTicketDto, testClientId);
  }

  /**
   * GET /tickets/mine
   * Get all tickets for the connected client
   * User: Client (authenticated)
   */
  @Get("mine")
  async getMyTickets() {
    // TODO: Replace with req.user.id from JWT
    const testClientId = "0d1fc0c3-81ce-4d83-a47d-bac610493ffd";
    return this.ticketsService.getClientTickets(testClientId);
  }

  /**
   * GET /tickets/assigned
   * Get all tickets assigned to the connected consultant
   * User: Consultant (authenticated)
   */
  @Get("assigned")
  async getAssignedTickets() {
    // TODO: Replace with req.user.id from JWT
    const testConsultantId = "d3286d1b-1504-481f-93b5-09576ca98c21";
    return this.ticketsService.getAssignedTickets(testConsultantId);
  }

  /**
   * GET /tickets/:id
   * Get ticket details
   * User: Client or Consultant
   */
  @Get(":id")
  async getTicket(@Param("id") ticketId: string) {
    // TODO: Replace with req.user.id from JWT
    const testClientId = "0d1fc0c3-81ce-4d83-a47d-bac610493ffd";
    return this.ticketsService.getTicketById(ticketId, testClientId);
  }

  /**
   * PATCH /tickets/:id/statut
   * Update ticket status
   * User: Consultant or Administrator
   */
  @Patch(":id/statut")
  async updateStatus(
    @Param("id") ticketId: string,
    @Body() updateStatusDto: UpdateTicketStatusDto
  ) {
    // TODO: Replace with req.user.id from JWT
    const testConsultantId = "d3286d1b-1504-481f-93b5-09576ca98c21";
    return this.ticketsService.updateStatus(ticketId, updateStatusDto, testConsultantId);
  }

  /**
   * POST /tickets/:id/compte-rendu
   * Create or update intervention report
   * User: Consultant
   */
  @Post(":id/compte-rendu")
  async createCompteRendu(
    @Param("id") ticketId: string,
    @Body() createCompteRenduDto: CreateCompteRenduDto
  ) {
    return this.ticketsService.createOrUpdateCompteRendu(ticketId, createCompteRenduDto);
  }

  /**
   * POST /tickets/:id/attachments
   * Add an attachment to a ticket
   * User: Client or Consultant
   */
  @Post(":id/attachments")
  async addAttachment(
    @Param("id") ticketId: string,
    @Body() createPieceJointeDto: CreatePieceJointeDto
  ) {
    return this.ticketsService.addAttachment(
      ticketId,
      createPieceJointeDto.nomFichier,
      createPieceJointeDto.chemin,
      createPieceJointeDto.type,
      createPieceJointeDto.taille
    );
  }

  /**
   * GET /tickets/:id/attachments
   * Get all attachments for a ticket
   * User: Client or Consultant
   */
  @Get(":id/attachments")
  async getAttachments(@Param("id") ticketId: string) {
    return this.ticketsService.getAttachments(ticketId);
  }

  /**
   * DELETE /tickets/:id/attachments/:attachmentId
   * Delete an attachment
   * User: Client or Consultant
   */
  @Delete(":id/attachments/:attachmentId")
  async deleteAttachment(
    @Param("id") ticketId: string,
    @Param("attachmentId") attachmentId: string
  ) {
    return this.ticketsService.deleteAttachment(attachmentId, ticketId);
  }
}
