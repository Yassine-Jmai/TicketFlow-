import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { loadEnvironment } from "../../environment";

type VerificationEmail = {
  recipientEmail: string;
  recipientName: string;
  token: string;
  code: string;
};

type TicketStatusNotification = {
  recipientEmail: string;
  recipientName: string;
  ticketNumber: string;
  ticketSubject: string;
  newStatus: string;
  changedAt: Date;
  consultantName?: string | null;
  report?: string | null;
  closureReason?: "CLIENT_VALIDATION" | "ADMINISTRATOR" | "AUTOMATIC";
  clientResponseReceived?: boolean;
  clientRejectedResolution?: boolean;
};

type TicketClosureStaffNotification = {
  recipientEmail: string;
  recipientName: string;
  ticketNumber: string;
  ticketSubject: string;
  clientName: string;
  closedAt: Date;
};

type TicketRejectionStaffNotification = {
  recipientEmail: string;
  recipientName: string;
  ticketNumber: string;
  ticketSubject: string;
  clientName: string;
  rejectedAt: Date;
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  NOUVEAU: "Nouveau",
  EN_COURS: "En cours",
  EN_ATTENTE_CLIENT: "En attente client",
  RESOLU: "Résolu",
  CLOTURE: "Clôturé"
};

@Injectable()
export class EmailService {
  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private async sendEmail(recipientEmail: string, recipientName: string, subject: string, htmlContent: string) {
    loadEnvironment();

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    if (!apiKey || !senderEmail) {
      throw new ServiceUnavailableException("Brevo email is not configured");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: "TicketFlow" },
        to: [{ email: recipientEmail, name: recipientName }],
        subject,
        htmlContent
      })
    });

    if (!response.ok) {
      const details = await response.text();
      console.error(`[Brevo] Email rejected (${response.status}): ${details}`);
      throw new ServiceUnavailableException("Brevo could not send the email");
    }
  }

  async sendVerificationEmail({ recipientEmail, recipientName, token, code }: VerificationEmail) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    const verificationUrl = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.sendEmail(
      recipientEmail,
      recipientName,
      "Verify your TicketFlow email",
      `<p>Hello ${recipientName},</p><p>Your TicketFlow verification code is:</p><p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${code}</p><p>You can also verify by clicking the link below:</p><p><a href="${verificationUrl}">Verify my email</a></p><p>This code and link expire in 24 hours.</p>`
    );
  }

  async sendAccountNotification({ recipientEmail, recipientName, subject, message }: {
    recipientEmail: string;
    recipientName: string;
    subject: string;
    message: string;
  }) {
    await this.sendEmail(recipientEmail, recipientName, subject, `<p>Hello ${recipientName},</p><p>${message}</p><p>TicketFlow support desk</p>`);
  }

  async sendTicketStatusNotification({
    recipientEmail,
    recipientName,
    ticketNumber,
    ticketSubject,
    newStatus,
    changedAt,
    consultantName,
    report,
    closureReason,
    clientResponseReceived,
    clientRejectedResolution
  }: TicketStatusNotification) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const statusLabel = TICKET_STATUS_LABELS[newStatus] ?? newStatus;
    const safeRecipientName = this.escapeHtml(recipientName);
    const safeTicketNumber = this.escapeHtml(ticketNumber);
    const safeTicketSubject = this.escapeHtml(ticketSubject);
    const safeConsultantName = consultantName
      ? this.escapeHtml(consultantName)
      : null;
    const safeReport = report ? this.escapeHtml(report) : null;
    const changedAtLabel = changedAt.toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short"
    });

    let explanation = "Le statut de votre ticket a été mis à jour.";

    if (newStatus === "EN_COURS") {
      explanation = clientRejectedResolution
        ? "Votre refus de la résolution a été enregistré. Le ticket est de nouveau en cours de traitement."
        : clientResponseReceived
        ? "Les éléments transmis ont bien été reçus. Votre ticket est de nouveau en cours de traitement."
        : consultantName
          ? `Votre ticket est maintenant pris en charge par ${safeConsultantName}.`
          : "Votre ticket est maintenant en cours de traitement.";
    } else if (newStatus === "EN_ATTENTE_CLIENT") {
      explanation = "Le consultant a besoin d'informations complémentaires pour poursuivre le traitement de votre ticket.";
    } else if (newStatus === "RESOLU") {
      explanation = "Votre ticket a été marqué comme résolu. Merci de vérifier la solution et de valider la résolution. Sans validation, le ticket sera automatiquement clôturé après 7 jours.";
    } else if (newStatus === "CLOTURE") {
      explanation = closureReason === "AUTOMATIC"
        ? "Votre ticket a été automatiquement clôturé après 7 jours sans nouvelle validation."
        : closureReason === "ADMINISTRATOR"
          ? "Votre ticket a été clôturé par un administrateur."
          : "Votre validation a été enregistrée et le ticket est maintenant clôturé.";
    }

    const reportSection = safeReport && (newStatus === "EN_ATTENTE_CLIENT" || newStatus === "RESOLU")
      ? `<h3>${newStatus === "EN_ATTENTE_CLIENT" ? "Informations demandées" : "Compte rendu d'intervention"}</h3><p style="white-space: pre-wrap;">${safeReport}</p>`
      : "";

    await this.sendEmail(
      recipientEmail,
      recipientName,
      `[TicketFlow] ${safeTicketNumber} - ${statusLabel}`,
      `<p>Bonjour ${safeRecipientName},</p>
       <p>${explanation}</p>
       <p><strong>Ticket :</strong> ${safeTicketNumber}<br>
       <strong>Objet :</strong> ${safeTicketSubject}<br>
       <strong>Nouveau statut :</strong> ${statusLabel}<br>
       <strong>Date :</strong> ${changedAtLabel}</p>
       ${reportSection}
       <p><a href="${appUrl}/dashboard">Consulter le ticket</a></p>
       <p>L'équipe support TicketFlow</p>`
    );
  }

  async sendTicketClosureStaffNotification({
    recipientEmail,
    recipientName,
    ticketNumber,
    ticketSubject,
    clientName,
    closedAt
  }: TicketClosureStaffNotification) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const safeRecipientName = this.escapeHtml(recipientName);
    const safeTicketNumber = this.escapeHtml(ticketNumber);
    const safeTicketSubject = this.escapeHtml(ticketSubject);
    const safeClientName = this.escapeHtml(clientName);
    const closedAtLabel = closedAt.toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short"
    });

    await this.sendEmail(
      recipientEmail,
      recipientName,
      `[TicketFlow] ${ticketNumber} - Ticket clôturé par le client`,
      `<p>Bonjour ${safeRecipientName},</p>
       <p>Le client a validé la résolution et clôturé le ticket suivant :</p>
       <p><strong>Ticket :</strong> ${safeTicketNumber}<br>
       <strong>Objet :</strong> ${safeTicketSubject}<br>
       <strong>Client :</strong> ${safeClientName}<br>
       <strong>Date de clôture :</strong> ${closedAtLabel}</p>
       <p>Le traitement de ce ticket est terminé.</p>
       <p><a href="${appUrl}/dashboard">Consulter le ticket</a></p>
       <p>L'équipe support TicketFlow</p>`
    );
  }

  async sendTicketRejectionStaffNotification({
    recipientEmail,
    recipientName,
    ticketNumber,
    ticketSubject,
    clientName,
    rejectedAt
  }: TicketRejectionStaffNotification) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const safeRecipientName = this.escapeHtml(recipientName);
    const safeTicketNumber = this.escapeHtml(ticketNumber);
    const safeTicketSubject = this.escapeHtml(ticketSubject);
    const safeClientName = this.escapeHtml(clientName);
    const rejectedAtLabel = rejectedAt.toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short"
    });

    await this.sendEmail(
      recipientEmail,
      recipientName,
      `[TicketFlow] ${ticketNumber} - Résolution refusée par le client`,
      `<p>Bonjour ${safeRecipientName},</p>
       <p>Le client a refusé la résolution du ticket suivant :</p>
       <p><strong>Ticket :</strong> ${safeTicketNumber}<br>
       <strong>Objet :</strong> ${safeTicketSubject}<br>
       <strong>Client :</strong> ${safeClientName}<br>
       <strong>Date du refus :</strong> ${rejectedAtLabel}</p>
       <p>Le ticket a été rouvert et son statut est de nouveau <strong>En cours</strong>.</p>
       <p><a href="${appUrl}/dashboard">Consulter le ticket</a></p>
       <p>L'équipe support TicketFlow</p>`
    );
  }

  async sendPasswordResetCode(recipientEmail: string, recipientName: string, code: string) {
    await this.sendEmail(
      recipientEmail,
      recipientName,
      "Your TicketFlow password reset code",
      `<p>Hello ${recipientName},</p><p>Use this code to reset your TicketFlow password:</p><p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${code}</p><p>This code expires in 1 hour. If you did not request this, you can ignore this email.</p>`
    );
  }
}
