import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { TicketsService } from "./tickets.service";

const AUTO_CLOSE_AFTER_DAYS = 7;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

@Injectable()
export class TicketsClosureJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketsClosureJob.name);
  private interval?: NodeJS.Timeout;

  constructor(private readonly ticketsService: TicketsService) {}

  onModuleInit() {
    void this.closeOldResolvedTickets();
    this.interval = setInterval(
      () => void this.closeOldResolvedTickets(),
      ONE_HOUR_IN_MS
    );
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async closeOldResolvedTickets() {
    try {
      const closedCount = await this.ticketsService.closeResolvedTicketsOlderThan(
        AUTO_CLOSE_AFTER_DAYS
      );

      if (closedCount > 0) {
        this.logger.log(`Automatically closed ${closedCount} resolved ticket(s)`);
      }
    } catch (error) {
      this.logger.error("Automatic ticket closure failed", error);
    }
  }
}
