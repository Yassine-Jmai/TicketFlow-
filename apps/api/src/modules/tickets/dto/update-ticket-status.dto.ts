import { IsEnum, IsNotEmpty } from "class-validator";
import { StatutTicket } from "@prisma/client";

export class UpdateTicketStatusDto {
  @IsEnum(StatutTicket)
  @IsNotEmpty()
  newStatus!: StatutTicket;
}
