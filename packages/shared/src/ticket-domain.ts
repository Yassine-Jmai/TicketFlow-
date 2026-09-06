export type UserRole = "CLIENT" | "CONSULTANT" | "ADMINISTRATEUR";
export type TicketStatus = "NOUVEAU" | "EN_COURS" | "EN_ATTENTE_CLIENT" | "RESOLU" | "CLOTURE";
export type TicketPriority = "BASSE" | "MOYENNE" | "HAUTE";

export interface TicketModule {
  id: string;
  nom: string;
  description?: string | null;
}

export interface User {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: UserRole;
  dateCreation: string;
}

export interface TicketSummary {
  id: string;
  numero: string;
  objet: string;
  description: string;
  priorite: TicketPriority;
  statut: TicketStatus;
  moduleId: string;
  clientId: string;
  assigneeId?: string | null;
  createdById: string;
}
