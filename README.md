# TicketFlow

TicketFlow is a full-stack customer-support platform for creating, assigning, tracking, and resolving support tickets. It gives clients, consultants, and administrators a focused workspace for moving every request from first report to final closure.

The project is organized as an npm workspace monorepo and uses Next.js, NestJS, Prisma, and PostgreSQL.

## What it does

- Registers users with email verification and supports password recovery
- Presents a role-specific dashboard for clients, consultants, and administrators
- Tracks ticket priority, product module, assignee, status, and full status history
- Supports consultant intervention reports and client responses
- Uploads and downloads PDF, image, text, and Word attachments up to 5 MB
- Automatically returns a ticket to `EN_COURS` when a client answers a request for information
- Lets clients approve resolved tickets and automatically closes tickets still awaiting approval after seven days
- Gives administrators tools to assign tickets, manage account roles, and remove tickets

## Technology

| Area | Technology |
| --- | --- |
| Web application | Next.js 15, React 19, TypeScript |
| API | NestJS 10, Passport JWT, class-validator |
| Data | PostgreSQL, Prisma 5 |
| Email | Brevo transactional email API |
| Repository | npm workspaces |

## Architecture

```mermaid
flowchart LR
    Browser[Browser] --> Web[Next.js web app<br/>port 3000]
    Web --> API[NestJS API<br/>port 3001]
    API --> Prisma[Prisma ORM]
    Prisma --> DB[(PostgreSQL)]
    API --> Brevo[Brevo email API]
    API --> Files[(Local attachment storage)]
```

```text
TicketFlow/
├── apps/
│   ├── api/                 # NestJS API, Prisma schema, migration, and seed
│   └── web/                 # Next.js App Router frontend
├── packages/
│   └── shared/              # Shared roles, statuses, priorities, and domain types
├── PROJECT_HISTORY.md       # Detailed implementation history
├── package.json             # Workspace scripts and dependencies
└── tsconfig.base.json       # Shared TypeScript configuration
```

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL
- A Brevo account with a verified sender address for sign-up and password-reset emails

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Configure the API

Create `apps/api/.env` with the following values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ticketflow?schema=public"
API_PORT="3001"
JWT_SECRET="replace-this-with-a-long-random-secret"
BREVO_API_KEY="your-brevo-api-key"
BREVO_SENDER_EMAIL="verified-sender@example.com"
APP_URL="http://localhost:3000"
```

Create the `ticketflow` PostgreSQL database first, and adjust the connection string for your local username, password, host, and database name.

`BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are required for new accounts because TicketFlow verifies email addresses before allowing login. `APP_URL` is used to build the verification link.

### 3. Configure the frontend

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

This file is optional for the default ports, but keeping it explicit makes local configuration easier to understand.

### 4. Prepare the database

Generate the Prisma client and synchronize the development database with the current schema:

```bash
npm exec --workspace=@ticketflow/api -- prisma generate
npm exec --workspace=@ticketflow/api -- prisma db push
```

Optional sample data can be added with:

```bash
npm run prisma:seed --workspace=@ticketflow/api
```

> [!IMPORTANT]
> The current seed is intended for API testing. Run it only on an empty development database: it is not idempotent, and its placeholder password values cannot be used to sign in through the web application.

### 5. Start TicketFlow

```bash
npm run dev
```

Open the following services:

| Service | URL |
| --- | --- |
| Web application | <http://localhost:3000> |
| REST API | <http://localhost:3001> |

On Windows installations that block PowerShell script shims, replace `npm` with `npm.cmd` in the commands above.

## Roles and permissions

| Capability | Client | Consultant | Administrator |
| --- | :---: | :---: | :---: |
| Create a ticket | Yes | — | — |
| View relevant tickets | Own | Assigned | All |
| Add or remove attachments | Own | Assigned | Yes |
| Add an intervention report | — | Assigned | — |
| Move a ticket through support statuses | — | Assigned | — |
| Validate and close a resolved ticket | Own | — | — |
| Assign a consultant | — | — | Yes |
| Manage users and roles | — | — | Yes |
| Delete a ticket | — | — | Yes |

## Ticket lifecycle

```mermaid
stateDiagram-v2
    [*] --> NOUVEAU
    NOUVEAU --> EN_COURS: consultant starts work
    EN_COURS --> EN_ATTENTE_CLIENT: more information required
    EN_ATTENTE_CLIENT --> EN_COURS: client adds an attachment
    EN_COURS --> RESOLU: consultant resolves ticket
    RESOLU --> CLOTURE: client approval or 7-day timeout
```

An intervention report is required before a consultant can move a ticket to `EN_ATTENTE_CLIENT` or `RESOLU`. Closed tickets are read-only.

## API overview

The API does not currently publish Swagger documentation. The main routes are:

| Area | Routes |
| --- | --- |
| Authentication | `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email`, `POST /auth/verify-code` |
| Users | `POST /users`, `GET /users`, `PUT /users/me`, `PUT /users/:id/role`, `DELETE /users/:id` |
| Ticket modules | `GET /ticket-modules` |
| Tickets | `POST /tickets`, `GET /tickets`, `GET /tickets/mine`, `GET /tickets/assigned`, `GET /tickets/:id`, `DELETE /tickets/:id` |
| Workflow | `PATCH /tickets/:id/statut`, `PATCH /tickets/:id/assign`, `PATCH /tickets/:id/validate` |
| Reports | `POST /tickets/:id/compte-rendu` |
| Attachments | `POST /tickets/:id/attachments`, `GET /tickets/:id/attachments`, download and delete routes |

A ready-to-import Postman collection is available at [`apps/api/TicketFlow_API_Testing.postman_collection.json`](apps/api/TicketFlow_API_Testing.postman_collection.json).

## Useful commands

Run these commands from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and frontend in watch mode |
| `npm run dev:api` | Start only the NestJS API |
| `npm run dev:web` | Start only the Next.js frontend |
| `npm run build --workspace=@ticketflow/api` | Build the NestJS API |
| `npm run build --workspace=@ticketflow/web` | Build the Next.js frontend |
| `npm run prisma:seed --workspace=@ticketflow/api` | Load development sample data |
| `npm exec --workspace=@ticketflow/api -- prisma studio` | Inspect the database with Prisma Studio |
| `npm exec tsc -- --noEmit -p apps/api/tsconfig.json` | Type-check the API |
| `npm exec tsc -- --noEmit -p apps/web/tsconfig.json` | Type-check the frontend |

## Development notes

- Uploaded files are stored under `apps/api/uploads/tickets` when the API is launched through the workspace script. This directory is ignored by Git and must be replaced with persistent object storage for production.
- Registration, profile management, and administrator user management use JWT authentication.
- Ticket routes are still in transition: the frontend sends `x-user-id` and `x-user-role` headers, and the API currently trusts those headers for ticket authorization. Do not expose the current build to untrusted traffic.
- The checked-in migration predates the latest user-verification fields. For local development, use `prisma db push` as shown above. Create a new migration before deploying the current schema.
- The repository does not yet include automated tests or a CI pipeline.

## Production checklist

Before deploying TicketFlow:

1. Replace temporary ticket identity headers with the authenticated user from the JWT guard.
2. Create and apply a migration for the current Prisma schema.
3. Move attachments to durable object storage and add malware scanning if uploads are public-facing.
4. Restrict CORS to trusted frontend origins and add API rate limiting.
5. Add automated unit, integration, and end-to-end tests.
6. Store database, JWT, and Brevo credentials in a secrets manager.

Never commit `.env` files, database credentials, API keys, or JWT secrets.

## Additional documentation

See [`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) for the implementation timeline, completed workflows, and earlier verification notes.
