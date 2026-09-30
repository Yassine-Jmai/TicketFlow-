# TicketFlow

TicketFlow is a customer-support ticket management platform built as an npm monorepo with Next.js, NestJS, Prisma, and PostgreSQL.

## Features

- Account registration, email verification, login, password reset, and profile management
- Role-based workspaces for clients, consultants, and administrators
- Ticket creation, assignment, status tracking, and automatic closure
- Intervention reports and file attachments
- Ticket status history
- Administrator account and role management
- Explainable consultant assignment recommendations based on workload and ticket history

## Project structure

```text
apps/
  api/       NestJS API and Prisma schema
  web/       Next.js frontend
packages/
  shared/    Shared TypeScript domain types
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL
- A Brevo account for registration and password-reset emails

## Local setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Create `apps/api/.env`:

   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketflow?schema=public"
   NODE_ENV="development"
   API_PORT="3001"
   JWT_SECRET="replace-with-a-long-random-secret"
   BREVO_API_KEY="your-brevo-api-key"
   BREVO_SENDER_EMAIL="verified-sender@example.com"
   APP_URL="http://localhost:3000"
   OPENAI_API_KEY="optional-openai-api-key"
   OPENAI_MODEL="gpt-4o-mini"
   ```

3. Optionally create `apps/web/.env.local`:

   ```env
   NEXT_PUBLIC_API_URL="http://localhost:3001"
   ```

The frontend uses this URL by default, so the file is only required when the API runs elsewhere.

`OPENAI_API_KEY` is optional. Without it, assignment recommendations still use
the deterministic workload and performance score. With it, the API also compares
the ticket with each consultant's recent resolved work and returns an AI-enhanced,
structured explanation. The administrator always makes the final assignment.

4. Create the local database schema and seed the ticket modules:

   ```bash
   npm exec --workspace=@ticketflow/api prisma db push
   npm run prisma:seed --workspace=@ticketflow/api
   ```

   Run the current seed only against an empty development database. It is not idempotent, and its placeholder user passwords cannot be used to log in.

5. Start the frontend and API:

   ```bash
   npm run dev
   ```

The applications will be available at:

- Frontend: http://localhost:3000
- API: http://localhost:3001

On Windows systems that block PowerShell script shims, use `npm.cmd` instead of `npm`.

## User roles

| Role | Access |
| --- | --- |
| `CLIENT` | Create tickets, view owned tickets, upload requested information, and validate resolved tickets |
| `CONSULTANT` | View assigned tickets, add reports, and move tickets through the support workflow |
| `ADMINISTRATEUR` | View all tickets, assign consultants, delete tickets, and manage user roles |

After changing an account's role, refresh the dashboard. JWT validation reads the account's current role from the database.

## Ticket workflow

```text
NOUVEAU -> EN_COURS -> EN_ATTENTE_CLIENT -> EN_COURS
                    -> RESOLU -> CLOTURE
```

Resolved tickets are automatically closed after seven days if the client does not close them first.

## Email delivery with Brevo

Registration and password recovery require a valid Brevo API key and a verified sender address. If Brevo reports an `unrecognised IP address`, authorize the server's public IP under Brevo's security settings and retry the request.

Never commit `apps/api/.env`, API keys, database passwords, or JWT secrets.

## Useful commands

```bash
# Run both applications
npm run dev

# Run one application
npm run dev:api
npm run dev:web

# Generate the Prisma client
npm exec --workspace=@ticketflow/api prisma generate

# Type-check the applications
npm exec tsc -- --noEmit -p apps/api/tsconfig.json
npm exec tsc -- --noEmit -p apps/web/tsconfig.json

# Build all workspaces
npm run build
```

## Development status

The project is under active development. Before a production deployment, replace the temporary ticket identity headers with JWT guards, create a migration matching the current Prisma schema, configure ESLint, add automated tests and rate limiting, and move attachment storage to persistent object storage.
