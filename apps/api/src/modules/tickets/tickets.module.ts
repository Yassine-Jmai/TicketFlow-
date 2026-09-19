import { Module } from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { TicketsController } from "./tickets.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { TicketsClosureJob } from "./tickets-closure.job";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [TicketsService, TicketsClosureJob],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
