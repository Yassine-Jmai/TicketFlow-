# TicketFlow

Monorepo for a customer ticket management platform built with Next.js, NestJS, and Prisma.

## Structure

- `apps/web` - Next.js frontend
- `apps/api` - NestJS API
- `packages/shared` - shared ticket domain types

## Domain

The scaffold follows the class diagram you provided:

- users with `CLIENT`, `CONSULTANT`, `ADMINISTRATEUR` roles
- tickets with priorities, statuses, attachments, reports, and status history
- modules linked to tickets

## Next step

Install dependencies and run:

```bash
npm install
npm run dev
```

## Brevo email verification

New accounts require email verification before login. Add these variables to `apps/api/.env`:

```env
BREVO_API_KEY="your-brevo-api-key"
BREVO_SENDER_EMAIL="the-verified-sender@example.com"
APP_URL="http://localhost:3000"
```

The sender address must be verified in Brevo. Never commit the API key.
