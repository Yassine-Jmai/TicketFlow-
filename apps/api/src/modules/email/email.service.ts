import { Injectable, ServiceUnavailableException } from "@nestjs/common";

type VerificationEmail = {
  recipientEmail: string;
  recipientName: string;
  token: string;
  code: string;
};

@Injectable()
export class EmailService {
  private async sendEmail(recipientEmail: string, recipientName: string, subject: string, htmlContent: string) {
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
}