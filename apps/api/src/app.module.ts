import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { TicketModulesModule } from "./modules/ticket-modules/ticket-modules.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { HistoryModule } from "./modules/history/history.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    TicketModulesModule,
    AttachmentsModule,
    ReportsModule,
    HistoryModule
  ]
})
export class AppModule {}
