import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TicketModulesController } from "./ticket-modules.controller";

@Module({
  imports: [PrismaModule],
  controllers: [TicketModulesController],
})
export class TicketModulesModule {}
