# TicketFlow Project History

This document records the work completed on TicketFlow from the initial project scaffold through the current development state.

## 1. Project Setup

- Created a monorepo with npm workspaces.
- Added three workspace areas:
  - `apps/api`: NestJS backend.
  - `apps/web`: Next.js frontend scaffold.
  - `packages/shared`: shared ticket-domain types.
- Configured the project for TypeScript with a shared base configuration.
- Installed the backend dependencies, including NestJS, Prisma, PostgreSQL support, validation, and TypeScript tooling.
- Added workspace scripts for development, building, and linting.

## 2. Database and Prisma Schema

- Connected the API to a local PostgreSQL database named `ticketflow_db`.
- Configured the development connection in `apps/api/.env`.
- Defined the ticket-management data model in `apps/api/prisma/schema.prisma`.
- Added models and relations for:
  - Users and roles.
  - Tickets.
  - Modules.
  - Attachments (`PieceJointe`).
  - Intervention reports (`CompteRendu`).
  - Status history (`HistoriqueStatut`).
- Applied the Prisma migration successfully.
- Enabled the PostgreSQL `pgcrypto` extension for UUID generation.

### Schema corrections

- Removed `createdById` and its relation from `Ticket`, because the client identity is the ticket creator.
- Made `HistoriqueStatut.ancienStatut` nullable so the initial transition can be recorded as `NULL` to `NOUVEAU`.
- Added indexes for frequent ticket queries:
  - `clientId`
  - `assigneeId`
  - `moduleId`
  - `statut`
  - `dateCreation`
- Added indexes on `ticketId` for status history and attachments.

## 3. Prisma Service

- Implemented the NestJS `PrismaService`.
- Added an explicit `$connect()` during module initialization.
- Added application shutdown handling so Prisma closes correctly with NestJS.

## 4. Test Data and Environment

- Added a Prisma seed script at `apps/api/prisma/seed.ts`.
- Seeded three modules:
  - Sage 100.
  - Sage 1000 FRP.
  - Dev.
- Seeded test users for the client, consultant, and administrator roles.
- Created a development test-data reference with UUIDs and endpoint examples.
- Added a Postman collection containing requests for the main ticket workflows.

## 5. Tickets Module

Created the NestJS tickets module with a controller, service, DTOs, and Prisma integration.

### Ticket service

Implemented the following behavior in `TicketsService`:

- Create tickets with unique numbers in the format `TICK-YYYYMMDD-XXXXX`.
- Validate that the selected module exists.
- Load ticket relations in returned results.
- List tickets belonging to a client.
- List tickets assigned to a consultant.
- Retrieve an individual ticket with its related data.
- Change ticket status.
- Create status-history records for status changes.
- Require an intervention report before changing a ticket to `RESOLU`.
- Add, list, and delete ticket attachments.
- Validate attachment ownership before deletion.
- Add intervention reports to tickets.

### DTO validation

Added DTOs using `class-validator` and `class-transformer` for:

- Ticket creation.
- Status changes.
- Intervention reports.
- Attachment metadata.

### HTTP endpoints

Implemented these endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/tickets` | Create a ticket |
| `GET` | `/tickets/mine` | List the client's tickets |
| `GET` | `/tickets/assigned` | List the consultant's tickets |
| `GET` | `/tickets/:id` | Retrieve one ticket |
| `PATCH` | `/tickets/:id/statut` | Change ticket status |
| `POST` | `/tickets/:id/compte-rendu` | Add an intervention report |
| `POST` | `/tickets/:id/attachments` | Add an attachment |
| `GET` | `/tickets/:id/attachments` | List attachments |
| `DELETE` | `/tickets/:id/attachments/:attachmentId` | Delete an attachment |

## 6. Manual API Testing

The development API was started on port `3000` and the main workflows were tested manually.

Verified behavior included:

- Creating tickets successfully.
- Generating ticket numbers such as `TICK-20260907-00001`.
- Listing a client's tickets.
- Retrieving ticket details.
- Adding and listing attachment metadata.
- Changing ticket status.
- Creating status-history records.
- Checking the `RESOLU` report requirement.

The test requests used seeded client and consultant UUIDs while authentication integration was still pending.

## 7. Build Troubleshooting

- Restricted the API TypeScript configuration to `src/**/*.ts`.
- Excluded the Prisma seed directory from the API compilation because it is outside the configured `rootDir`.
- Confirmed that TypeScript type-checking reports no errors.
- Investigated why `nest build` completes without creating `apps/api/dist/main.js`.
- Reinstalled dependencies from the workspace root and confirmed that TypeScript and the Nest CLI are hoisted into the root `node_modules` directory.

### Current build issue

The API still does not produce `apps/api/dist/main.js`, so `npm start` cannot launch the compiled application. The development API had previously run successfully, but the production-style build output remains unresolved.

The root workspace `npm run dev` command also requires the root `concurrently` dependency to be available. Dependencies were reinstalled from the workspace root to restore it.

## 8. Current Limitations and Next Steps

- Replace hardcoded test UUIDs in the tickets controller with the authenticated user from `req.user`.
- Connect the tickets module to the authentication and JWT guard provided by the auth work.
- Add role-based access control.
- Define and enforce all allowed status transitions.
- Add automatic closure after seven days where required.
- Add email notifications for status changes.
- Add unit and integration tests.
- Resolve the API compiled-output issue so `npm run build` creates `apps/api/dist/main.js`.
- Continue frontend implementation in `apps/web`.
