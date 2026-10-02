CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketMessage_ticketId_dateCreation_idx" ON "TicketMessage"("ticketId", "dateCreation");
CREATE INDEX "TicketMessage_auteurId_idx" ON "TicketMessage"("auteurId");

ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;