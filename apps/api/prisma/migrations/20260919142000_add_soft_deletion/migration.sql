-- Preserve users and tickets for audit purposes instead of deleting them.
ALTER TABLE "Utilisateur" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Utilisateur_deletedAt_idx" ON "Utilisateur"("deletedAt");
CREATE INDEX "Ticket_archivedAt_idx" ON "Ticket"("archivedAt");
