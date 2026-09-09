import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("ticket-modules")
export class TicketModulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getModules() {
    return this.prisma.ticketModule.findMany({
      orderBy: { nom: "asc" },
    });
  }
}
