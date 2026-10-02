ALTER TABLE "Utilisateur" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Utilisateur_deletedAt_idx" ON "Utilisateur"("deletedAt");
CREATE INDEX IF NOT EXISTS "Ticket_archivedAt_idx" ON "Ticket"("archivedAt");