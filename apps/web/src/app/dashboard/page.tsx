"use client";

import "./dashboard.css";

import Link from "next/link";
import type {
  TicketModule,
  TicketPriority,
  TicketStatus,
  User,
  UserRole,
} from "@ticketflow/shared";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const STATUS_FLOW: Record<TicketStatus, TicketStatus[]> = {
  NOUVEAU: ["EN_COURS"],
  EN_COURS: ["EN_ATTENTE_CLIENT", "RESOLU"],
  EN_ATTENTE_CLIENT: ["EN_COURS"],
  RESOLU: ["CLOTURE"],
  CLOTURE: [],
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  NOUVEAU: "Nouveau",
  EN_COURS: "En cours",
  EN_ATTENTE_CLIENT: "En attente client",
  RESOLU: "Résolu",
  CLOTURE: "Clôturé",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  BASSE: "Basse",
  MOYENNE: "Moyenne",
  HAUTE: "Haute",
};

const ROLE_LABEL: Record<UserRole, string> = {
  CLIENT: "Client",
  CONSULTANT: "Consultant",
  ADMINISTRATEUR: "Administrateur",
};

const ROLE_QUEUE_LABEL: Record<UserRole, string> = {
  CLIENT: "Mes tickets",
  CONSULTANT: "Tickets affectés",
  ADMINISTRATEUR: "Tous les tickets",
};

const STATUS_ACTION_LABEL: Record<TicketStatus, string> = {
  NOUVEAU: "Prendre en charge",
  EN_COURS: "Reprendre",
  EN_ATTENTE_CLIENT: "Demander des informations",
  RESOLU: "Marquer résolu",
  CLOTURE: "Clôturer",
};

type Attachment = {
  id: string;
  nomFichier: string;
  chemin: string;
  type: string;
  taille: number;
  dateAjout: string;
};

type Report = {
  id: string;
  contenu: string;
  dateCreation: string;
  dateModification: string;
};

type HistoryEntry = {
  id: string;
  ancienStatut: TicketStatus | null;
  nouveauStatut: TicketStatus;
  dateChangement: string;
  auteur?: Pick<User, "id" | "email" | "nom" | "prenom">;
};

type Ticket = {
  id: string;
  numero: string;
  objet: string;
  description: string;
  priorite: TicketPriority;
  statut: TicketStatus;
  dateCreation: string;
  dateModification: string;
  dateCloture?: string | null;
  moduleId: string;
  clientId: string;
  assigneeId?: string | null;
  module?: TicketModule;
  client?: Pick<User, "id" | "email" | "nom" | "prenom">;
  assignee?: Pick<User, "id" | "email" | "nom" | "prenom"> | null;
  compteRendu?: Report | null;
  pieceJointes?: Attachment[];
  historiques?: HistoryEntry[];
};

type CreateTicketForm = {
  moduleId: string;
  objet: string;
  description: string;
  priorite: TicketPriority;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : {
            "Content-Type": "application/json",
            ...init?.headers,
          },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = await response.json();
      message = Array.isArray(body.message)
        ? body.message.join(", ")
        : body.message ?? message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function userName(user?: Pick<User, "nom" | "prenom" | "email"> | null) {
  if (!user) {
    return "Non affecté";
  }

  return `${user.prenom} ${user.nom}`.trim() || user.email;
}

function statusActionLabel(currentStatus: TicketStatus, nextStatus: TicketStatus) {
  if (currentStatus === "NOUVEAU" && nextStatus === "EN_COURS") {
    return "Prendre en charge";
  }

  if (nextStatus === "EN_ATTENTE_CLIENT") {
    return "Demander des informations";
  }

  if (currentStatus === "EN_ATTENTE_CLIENT" && nextStatus === "EN_COURS") {
    return "Reprendre le traitement";
  }

  if (nextStatus === "RESOLU") {
    return "Marquer comme résolu";
  }

  if (nextStatus === "CLOTURE") {
    return "Clôturer";
  }

  return STATUS_ACTION_LABEL[nextStatus];
}

function InterfaceIcon({
  name,
}: {
  name: "grid" | "pulse" | "clock" | "check" | "refresh";
}) {
  const paths = {
    grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
    pulse: <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" />,
    clock: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    check: <path d="m7 12 3 3 7-7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    refresh: <path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6 6.5L4 11m16 2-2 4.5A7 7 0 0 1 5.5 15" />,
  };

  return (
    <svg aria-hidden="true" className="interface-icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export default function HomePage() {
  const [role, setRole] = useState<UserRole>("CLIENT");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [modules, setModules] = useState<TicketModule[]>([]);
  const [consultants, setConsultants] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string>("");
  const [createForm, setCreateForm] = useState<CreateTicketForm>({
    moduleId: "",
    objet: "",
    description: "",
    priorite: "MOYENNE",
  });
  const [reportContent, setReportContent] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [createAttachmentFile, setCreateAttachmentFile] = useState<File | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [message, setMessage] = useState("Prêt");
  const [isLoading, setIsLoading] = useState(false);
  const [statusActionMessage, setStatusActionMessage] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0],
    [selectedTicketId, tickets]
  );

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.statut !== "CLOTURE").length,
      waiting: tickets.filter((ticket) => ticket.statut === "EN_ATTENTE_CLIENT").length,
      resolved: tickets.filter((ticket) => ticket.statut === "RESOLU").length,
    }),
    [tickets]
  );

  async function loadReferenceData() {
    const [moduleList, consultantList] = await Promise.all([
      requestJson<TicketModule[]>("/ticket-modules"),
      requestJson<User[]>("/users/consultants"),
    ]);

    setModules(moduleList);
    setConsultants(consultantList);
    setCreateForm((current) => ({
      ...current,
      moduleId: current.moduleId || moduleList[0]?.id || "",
    }));
    setAssigneeId((current) => current || consultantList[0]?.id || "");
  }

  function getAuthHeaders() {
    if (!currentUser) {
      throw new Error("Session utilisateur introuvable");
    }

    const token = window.localStorage.getItem("ticketflow_access_token") ?? "";

    return {
      Authorization: `Bearer ${token}`,
      "x-user-id": currentUser.id,
      "x-user-role": currentUser.role,
    };
  }

  async function apiJson<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    return requestJson<T>(path, {
      ...init,
      headers: {
        ...getAuthHeaders(),
        ...init?.headers,
      },
    });
  }

  async function loadTickets(currentRole = role) {
    setIsLoading(true);

    try {
      const path =
        currentRole === "CLIENT"
          ? "/tickets/mine"
          : currentRole === "CONSULTANT"
            ? "/tickets/assigned"
            : "/tickets";
      const ticketList = await apiJson<Ticket[]>(path);

      setTickets(ticketList);
      setSelectedTicketId((current) =>
        ticketList.some((ticket) => ticket.id === current)
          ? current
          : ticketList[0]?.id || ""
      );
      setMessage(`${ticketList.length} ticket(s) chargé(s)`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de charger les tickets");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const savedUser = window.localStorage.getItem("ticketflow_user");
    const token = window.localStorage.getItem("ticketflow_access_token");

    if (!savedUser || !token) {
      window.location.replace("/");
      return;
    }

    try {
      const user = JSON.parse(savedUser) as User;

      if (!user.id || !Object.prototype.hasOwnProperty.call(ROLE_LABEL, user.role)) {
        throw new Error("Invalid stored user");
      }

      setCurrentUser(user);
      setRole(user.role);
      setAuthReady(true);
    } catch {
      window.localStorage.removeItem("ticketflow_access_token");
      window.localStorage.removeItem("ticketflow_user");
      window.location.replace("/");
    }
  }, []);

  useEffect(() => {
    void loadReferenceData().catch((error) => {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de charger les données de référence"
      );
    });
  }, []);

  useEffect(() => {
    if (authReady && currentUser) {
      void loadTickets(role);
    }
  }, [authReady, currentUser, role]);

  useEffect(() => {
    setReportContent(selectedTicket?.compteRendu?.contenu ?? "");
    setAssigneeId(selectedTicket?.assigneeId || consultants[0]?.id || "");
  }, [
    selectedTicket?.id,
    selectedTicket?.compteRendu?.contenu,
    selectedTicket?.assigneeId,
    consultants,
  ]);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const createdTicket = await apiJson<Ticket>("/tickets", {
        method: "POST",
        body: JSON.stringify(createForm),
      });

      if (createAttachmentFile) {
        const formData = new FormData();
        formData.append("file", createAttachmentFile);

        await apiJson<Attachment>(`/tickets/${createdTicket.id}/attachments`, {
          method: "POST",
          body: formData,
        });
      }

      setMessage(
        createAttachmentFile
          ? `${createdTicket.numero} créé avec pièce jointe`
          : `${createdTicket.numero} créé`
      );
      setCreateForm({
        moduleId: modules[0]?.id || "",
        objet: "",
        description: "",
        priorite: "MOYENNE",
      });
      setCreateAttachmentFile(null);
      if (createFileInputRef.current) {
        createFileInputRef.current.value = "";
      }
      await loadTickets(role);
      setSelectedTicketId(createdTicket.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de créer le ticket");
    }
  }

  async function changeStatus(nextStatus: TicketStatus) {
    if (!selectedTicket) {
      return;
    }

    setIsUpdatingStatus(true);
    setStatusActionMessage("Mise à jour du statut et envoi de l’email...");

    try {
      const result = await apiJson<Ticket & { notificationSent?: boolean }>(
        `/tickets/${selectedTicket.id}/statut`, {
        method: "PATCH",
        body: JSON.stringify({ newStatus: nextStatus }),
      });
      await loadTickets(role);
      const notificationMessage = result.notificationSent
        ? `Email envoyé à ${selectedTicket.client?.email ?? "l'adresse du client"}`
        : "Statut modifié, mais l'email n'a pas pu être envoyé. Vérifiez la configuration Brevo et les journaux de l'API.";
      setMessage(
        `${selectedTicket.numero} passé à ${STATUS_LABEL[nextStatus]}. ${notificationMessage}`
      );
      setStatusActionMessage(notificationMessage);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Impossible de changer le statut";
      setMessage(errorMessage);
      setStatusActionMessage(`Échec : ${errorMessage}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function closeAsClient() {
    if (!selectedTicket) {
      return;
    }

    try {
      const result = await apiJson<Ticket & {
        staffNotificationsSent?: number;
        staffNotificationRecipients?: number;
      }>(`/tickets/${selectedTicket.id}/validate`, {
          method: "PATCH",
        });
      const staffMessage = result.staffNotificationRecipients
        ? `${result.staffNotificationsSent ?? 0}/${result.staffNotificationRecipients} notification(s) envoyée(s) au consultant et aux administrateurs.`
        : "Aucun consultant ou administrateur à notifier.";
      setMessage(`${selectedTicket.numero} clôturé. ${staffMessage}`);
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de clôturer le ticket");
    }
  }

  async function rejectAsClient() {
    if (!selectedTicket) {
      return;
    }

    try {
      const result = await apiJson<Ticket & {
        staffNotificationsSent?: number;
        staffNotificationRecipients?: number;
      }>(`/tickets/${selectedTicket.id}/reject`, {
        method: "PATCH",
      });
      const staffMessage = result.staffNotificationRecipients
        ? `${result.staffNotificationsSent ?? 0}/${result.staffNotificationRecipients} notification(s) envoyée(s) au consultant et aux administrateurs.`
        : "Aucun consultant ou administrateur à notifier.";
      setMessage(`${selectedTicket.numero} rouvert et remis en cours. ${staffMessage}`);
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de rejeter la résolution");
    }
  }

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTicket) {
      return;
    }

    try {
      await apiJson<Report>(`/tickets/${selectedTicket.id}/compte-rendu`, {
        method: "POST",
        body: JSON.stringify({ contenu: reportContent }),
      });
      setMessage("Compte rendu enregistré");
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'enregistrer le compte rendu");
    }
  }

  async function assignTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTicket) {
      return;
    }

    try {
      await apiJson<Ticket>(`/tickets/${selectedTicket.id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ consultantId: assigneeId }),
      });
      setMessage("Ticket affecté");
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'affecter le ticket");
    }
  }

  async function archiveTicket() {
    if (!selectedTicket) {
      return;
    }

    const shouldArchive = window.confirm(
      `Archiver ${selectedTicket.numero} ? Son historique sera conservé.`
    );

    if (!shouldArchive) {
      return;
    }

    try {
      await apiJson<Ticket>(`/tickets/${selectedTicket.id}`, {
        method: "DELETE",
      });
      setMessage(`${selectedTicket.numero} archivé. Son historique est conservé.`);
      setSelectedTicketId("");
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'archiver le ticket");
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTicket || !uploadFile) {
      setMessage("Choisissez une pièce jointe");
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      await apiJson<Attachment>(`/tickets/${selectedTicket.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setMessage(
        isClientResponseUpload
          ? "Réponse envoyée, le ticket repasse en cours"
          : "Pièce jointe envoyée"
      );
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'envoyer la pièce jointe");
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!selectedTicket) {
      return;
    }

    try {
      await apiJson<Attachment>(
        `/tickets/${selectedTicket.id}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      setMessage("Pièce jointe supprimée");
      await loadTickets(role);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de supprimer la pièce jointe");
    }
  }

  async function downloadAttachment(attachment: Attachment) {
    if (!selectedTicket) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/tickets/${selectedTicket.id}/attachments/${attachment.id}/download`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(response.statusText || "Impossible de télécharger la pièce jointe");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.nomFichier;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de télécharger la pièce jointe");
    }
  }

  function updateCreateForm<K extends keyof CreateTicketForm>(
    key: K,
    value: CreateTicketForm[K]
  ) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  const nextStatuses = selectedTicket
    ? STATUS_FLOW[selectedTicket.statut].filter((status) => status !== "CLOTURE")
    : [];
  const canCreateTicket = role === "CLIENT";
  const canChangeStatus = role === "CONSULTANT";
  const canAssignTicket = role === "ADMINISTRATEUR";
  const canArchiveTicket =
    role === "ADMINISTRATEUR" && selectedTicket?.statut !== "CLOTURE";
  const canEditReport = role === "CONSULTANT";
  const canValidateTicket = role === "CLIENT" && selectedTicket?.statut === "RESOLU";
  const canRejectTicket = role === "CLIENT" && selectedTicket?.statut === "RESOLU";
  const isClientResponseUpload =
    role === "CLIENT" && selectedTicket?.statut === "EN_ATTENTE_CLIENT";
  const hasSavedReport = Boolean(selectedTicket?.compteRendu?.contenu?.trim());
  const reportTitle = isClientResponseUpload
    ? "Demande du consultant"
    : "Compte rendu d'intervention";
  const reportState = isClientResponseUpload
    ? "Réponse attendue"
    : selectedTicket?.compteRendu
      ? "Enregistré"
      : "Requis pour attente/résolution";
  const canUploadAttachment =
    Boolean(selectedTicket) && selectedTicket?.statut !== "CLOTURE";

  if (!authReady || !currentUser) {
    return (
      <main className="app-shell">
        <div className="dashboard-loading">Chargement de votre espace...</div>
      </main>
    );
  }

  function signOut() {
    window.localStorage.removeItem("ticketflow_access_token");
    window.localStorage.removeItem("ticketflow_user");
    window.location.assign("/");
  }

  return (
    <main className="app-shell">
      <div aria-hidden="true" className="ambient-orb ambient-orb-one" />
      <div aria-hidden="true" className="ambient-orb ambient-orb-two" />
      <header className="topbar">
        <div className="brand-block">
          <div aria-hidden="true" className="brand-mark">
            <span />
          </div>
          <div>
            <p className="eyebrow">TicketFlow <span>// Control center</span></p>
            <h1>Gestion des tickets</h1>
            <p className="topbar-subtitle">Pilotez chaque demande, du signal à la résolution.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="role-chip">{ROLE_LABEL[role]}</span>
          {role === "ADMINISTRATEUR" ? (
            <Link className="ghost-button topbar-link" href="/client-management">
              Gérer les utilisateurs
            </Link>
          ) : null}
          <Link className="ghost-button topbar-link" href="/profile">
            Mon profil
          </Link>
          <button className="ghost-button refresh-button" onClick={() => void loadTickets(role)} type="button">
            <InterfaceIcon name="refresh" />
            Actualiser
          </button>
          <button className="ghost-button" onClick={signOut} type="button">
            Déconnexion
          </button>
        </div>
      </header>

      <section aria-live="polite" className="status-strip">
        <span className="system-status"><i className={isLoading ? "loading" : ""} />{isLoading ? "Synchronisation..." : message}</span>
        <span className="active-identity">
          {currentUser ? `${ROLE_LABEL[role]}: ${userName(currentUser)}` : API_URL}
        </span>
      </section>

      <section className="metric-row">
        <div className="metric metric-total">
          <span className="metric-icon"><InterfaceIcon name="grid" /></span>
          <span className="metric-copy">Volume total<small>Tous les tickets</small></span>
          <strong>{stats.total}</strong>
        </div>
        <div className="metric metric-open">
          <span className="metric-icon"><InterfaceIcon name="pulse" /></span>
          <span className="metric-copy">En activité<small>Tickets ouverts</small></span>
          <strong>{stats.open}</strong>
        </div>
        <div className="metric metric-waiting">
          <span className="metric-icon"><InterfaceIcon name="clock" /></span>
          <span className="metric-copy">En attente<small>Action client</small></span>
          <strong>{stats.waiting}</strong>
        </div>
        <div className="metric metric-resolved">
          <span className="metric-icon"><InterfaceIcon name="check" /></span>
          <span className="metric-copy">Résolus<small>Prêts à clôturer</small></span>
          <strong>{stats.resolved}</strong>
        </div>
      </section>

      <div className="workspace">
        <aside className="left-rail">
          {canCreateTicket ? (
            <form className="tool-panel" onSubmit={createTicket}>
              <div className="panel-heading">
                <h2>Nouveau ticket</h2>
              </div>
              <label>
                Module
                <select
                  onChange={(event) => updateCreateForm("moduleId", event.target.value)}
                  required
                  value={createForm.moduleId}
                >
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objet
                <input
                  onChange={(event) => updateCreateForm("objet", event.target.value)}
                  required
                  value={createForm.objet}
                />
              </label>
              <label>
                Description
                <textarea
                  onChange={(event) => updateCreateForm("description", event.target.value)}
                  required
                  rows={4}
                  value={createForm.description}
                />
              </label>
              <label>
                Priorité
                <select
                  onChange={(event) =>
                    updateCreateForm("priorite", event.target.value as TicketPriority)
                  }
                  value={createForm.priorite}
                >
                  {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pièce jointe optionnelle
                <input
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setCreateAttachmentFile(event.target.files?.[0] ?? null)
                  }
                  ref={createFileInputRef}
                  type="file"
                />
              </label>
              <button className="primary-button" disabled={!modules.length} type="submit">
                Créer le ticket
              </button>
            </form>
          ) : (
            <section className="tool-panel">
              <div className="panel-heading">
                <h2>Espace {ROLE_LABEL[role]}</h2>
              </div>
              <p className="empty-text">
                {role === "CONSULTANT"
                  ? "Les tickets affectés sont affichés ci-dessous."
                  : "Les tickets sont disponibles pour supervision et affectation."}
              </p>
            </section>
          )}

          <section className="ticket-list">
            <div className="panel-heading">
              <h2>{ROLE_QUEUE_LABEL[role]}</h2>
              <span>{tickets.length}</span>
            </div>
            {tickets.length ? (
              tickets.map((ticket) => (
                <article
                  className={`ticket-row ${selectedTicket?.id === ticket.id ? "selected" : ""}`}
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <span>
                    <strong>{ticket.numero}</strong>
                    <small>{ticket.objet}</small>
                  </span>
                  <em className={`status ${ticket.statut.toLowerCase()}`}>
                    {STATUS_LABEL[ticket.statut]}
                  </em>
                </article>
              ))
            ) : (
              <p className="empty-text">Aucun ticket trouvé.</p>
            )}
          </section>
        </aside>

        <section className="detail-area">
          {selectedTicket ? (
            <>
              <div className="ticket-header">
                <div>
                  <p className="eyebrow">{selectedTicket.numero}</p>
                  <h2>{selectedTicket.objet}</h2>
                  <p>{selectedTicket.description}</p>
                </div>
                <div className="ticket-header-actions">
                  <em className={`status large ${selectedTicket.statut.toLowerCase()}`}>
                    {STATUS_LABEL[selectedTicket.statut]}
                  </em>
                  {canArchiveTicket ? (
                    <button
                      className="danger-button"
                      onClick={() => void archiveTicket()}
                      type="button"
                    >
                      Archiver
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="info-grid">
                <div>
                  <span>Module</span>
                  <strong>{selectedTicket.module?.nom ?? selectedTicket.moduleId}</strong>
                </div>
                <div>
                  <span>Priorité</span>
                  <strong>{PRIORITY_LABEL[selectedTicket.priorite]}</strong>
                </div>
                <div>
                  <span>Client</span>
                  <strong>{userName(selectedTicket.client)}</strong>
                </div>
                <div>
                  <span>Consultant</span>
                  <strong>{userName(selectedTicket.assignee)}</strong>
                </div>
                <div>
                  <span>Créé le</span>
                  <strong>{formatDate(selectedTicket.dateCreation)}</strong>
                </div>
                <div>
                  <span>Clôturé le</span>
                  <strong>{formatDate(selectedTicket.dateCloture)}</strong>
                </div>
              </div>

              <section className="action-grid">
                {!canAssignTicket ? (
                  <div className="tool-panel">
                    <div className="panel-heading">
                      <h3>Statut</h3>
                    </div>
                    <div className="button-row">
                      {canChangeStatus
                        ? nextStatuses.map((status) => (
                            <button
                              className="primary-button"
                              disabled={isUpdatingStatus || (
                                (status === "EN_ATTENTE_CLIENT" || status === "RESOLU") &&
                                !hasSavedReport
                              )}
                              key={status}
                              onClick={() => void changeStatus(status)}
                              type="button"
                            >
                              {isUpdatingStatus
                                ? "Traitement..."
                                : statusActionLabel(selectedTicket.statut, status)}
                            </button>
                          ))
                        : null}
                      {canValidateTicket ? (
                        <button
                          className="primary-button"
                          onClick={() => void closeAsClient()}
                          type="button"
                        >
                          Valider et clôturer
                        </button>
                      ) : null}
                      {canRejectTicket ? (
                        <button
                          className="danger-button"
                          onClick={() => void rejectAsClient()}
                          type="button"
                        >
                          Rejeter et rouvrir
                        </button>
                      ) : null}
                      {!canChangeStatus && !canValidateTicket && !canRejectTicket ? (
                        <p className="empty-text">Le changement de statut est réservé au consultant.</p>
                      ) : null}
                      {canChangeStatus && nextStatuses.length === 0 ? (
                        <p className="empty-text">Aucune transition disponible.</p>
                      ) : null}
                      {statusActionMessage ? (
                        <p aria-live="polite" className="empty-text" role="status">
                          {statusActionMessage}
                        </p>
                      ) : null}
                      {canChangeStatus &&
                      nextStatuses.some(
                        (status) => status === "EN_ATTENTE_CLIENT" || status === "RESOLU"
                      ) &&
                      !hasSavedReport ? (
                        <p className="empty-text">Compte rendu requis.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {canAssignTicket ? (
                  <form className="tool-panel" onSubmit={assignTicket}>
                    <div className="panel-heading">
                      <h3>Assignment</h3>
                    </div>
                    <label>
                      Consultant
                      <select
                        disabled={selectedTicket.statut === "CLOTURE"}
                        onChange={(event) => setAssigneeId(event.target.value)}
                        value={assigneeId}
                      >
                        {consultants.map((consultant) => (
                          <option key={consultant.id} value={consultant.id}>
                            {userName(consultant)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={!assigneeId || selectedTicket.statut === "CLOTURE"}
                      type="submit"
                    >
                      Assign
                    </button>
                  </form>
                ) : null}

                {canEditReport ? (
                  <form className="tool-panel wide" onSubmit={saveReport}>
                    <div className="panel-heading">
                      <h3>Compte rendu / demande client</h3>
                      <span>{reportState}</span>
                    </div>
                    <textarea
                      disabled={selectedTicket.statut === "CLOTURE"}
                      onChange={(event) => setReportContent(event.target.value)}
                      required
                      rows={5}
                      value={reportContent}
                    />
                    <button
                      className="secondary-button"
                      disabled={selectedTicket.statut === "CLOTURE"}
                      type="submit"
                    >
                      Enregistrer
                    </button>
                  </form>
                ) : (
                  <section
                    className={`tool-panel wide ${
                      isClientResponseUpload ? "attention-panel" : ""
                    }`}
                  >
                    <div className="panel-heading">
                      <h3>{reportTitle}</h3>
                      <span>{reportState}</span>
                    </div>
                    <div className="report-display">
                      {selectedTicket.compteRendu?.contenu || "Aucun compte rendu."}
                    </div>
                  </section>
                )}

                <section
                  className={`tool-panel wide ${
                    isClientResponseUpload ? "attention-panel" : ""
                  }`}
                >
                  <div className="panel-heading">
                    <h3>
                      {isClientResponseUpload
                        ? "Envoyer les éléments demandés"
                        : "Pièces jointes"}
                    </h3>
                    <span>
                      {isClientResponseUpload
                        ? "Réponse client"
                        : selectedTicket.pieceJointes?.length ?? 0}
                    </span>
                  </div>
                  <form className="upload-row" onSubmit={uploadAttachment}>
                    <input
                      disabled={!canUploadAttachment}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setUploadFile(event.target.files?.[0] ?? null)
                      }
                      ref={fileInputRef}
                      type="file"
                    />
                    <button
                      className="secondary-button"
                      disabled={!uploadFile || !canUploadAttachment}
                      type="submit"
                    >
                      {isClientResponseUpload ? "Envoyer la réponse" : "Ajouter"}
                    </button>
                  </form>
                  <div className="attachment-list">
                    {(selectedTicket.pieceJointes ?? []).map((attachment) => (
                      <div className="attachment-row" key={attachment.id}>
                        <span>
                          <strong>{attachment.nomFichier}</strong>
                          <small>
                            {formatBytes(attachment.taille)} - {attachment.type}
                          </small>
                        </span>
                        <div>
                          <button
                            className="ghost-button compact"
                            onClick={() => void downloadAttachment(attachment)}
                            type="button"
                          >
                            Télécharger
                          </button>
                          <button
                            className="danger-button compact"
                            disabled={selectedTicket.statut === "CLOTURE"}
                            onClick={() => void deleteAttachment(attachment.id)}
                            type="button"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                    {selectedTicket.pieceJointes?.length ? null : (
                      <p className="empty-text">Aucune pièce jointe.</p>
                    )}
                  </div>
                </section>

                <section className="tool-panel wide">
                  <div className="panel-heading">
                    <h3>Historique des statuts</h3>
                  </div>
                  <div className="history-list">
                    {(selectedTicket.historiques ?? []).map((history) => (
                      <div className="history-row" key={history.id}>
                        <span>
                          <strong>
                            {history.ancienStatut
                              ? STATUS_LABEL[history.ancienStatut]
                              : "Création"}{" "}
                            vers {STATUS_LABEL[history.nouveauStatut]}
                          </strong>
                          <small>{userName(history.auteur)}</small>
                        </span>
                        <time>{formatDate(history.dateChangement)}</time>
                      </div>
                    ))}
                    {selectedTicket.historiques?.length ? null : (
                      <p className="empty-text">Aucun historique.</p>
                    )}
                  </div>
                </section>
              </section>
            </>
          ) : (
            <div className="empty-state">
              <h2>Aucun ticket sélectionné</h2>
              <p>Créez un ticket ou changez d'espace.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
