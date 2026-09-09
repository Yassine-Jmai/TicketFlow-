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
- Change ticket status through the consultant workflow.
- Create status-history records for status changes.
- Enforce the strict ticket status workflow:
  - `NOUVEAU` to `EN_COURS`.
  - `EN_COURS` to `EN_ATTENTE_CLIENT` or `RESOLU`.
  - `EN_ATTENTE_CLIENT` to `EN_COURS`.
- Keep `RESOLU` to `CLOTURE` behind client validation only.
- No status changes after `CLOTURE`.
- Record the initial status-history entry as `NULL` to `NOUVEAU` during ticket creation.
- Require an intervention report before changing a ticket to `RESOLU`.
- Require an intervention report before changing a ticket to `EN_ATTENTE_CLIENT`,
  so the consultant explains what information is missing.
- Prevent modifications to closed tickets through assignment, reports, and attachments.
- Validate that assigned users have the `CONSULTANT` role.
- Store uploaded ticket attachments on disk.
- Validate uploaded attachment size and MIME type.
- Add, list, download, and delete ticket attachments.
- Validate attachment ownership before deletion.
- Delete the stored file when an attachment is deleted.
- Allow administrators to delete tickets.
- Delete dependent ticket records and stored attachment files when an administrator deletes a ticket.
- When a client uploads an attachment on an `EN_ATTENTE_CLIENT` ticket, automatically
  return the ticket to `EN_COURS` and record the status history entry.
- Add intervention reports to tickets.
- Allow clients to validate a resolved ticket and close it.
- Automatically close tickets that remain `RESOLU` for seven days.

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
| `PATCH` | `/tickets/:id/statut` | Change ticket status through the consultant workflow |
| `PATCH` | `/tickets/:id/assign` | Assign a ticket to a consultant |
| `PATCH` | `/tickets/:id/validate` | Client validation and closure of a resolved ticket |
| `POST` | `/tickets/:id/compte-rendu` | Add an intervention report |
| `POST` | `/tickets/:id/attachments` | Upload an attachment with `multipart/form-data` field `file` |
| `GET` | `/tickets/:id/attachments` | List attachments |
| `GET` | `/tickets/:id/attachments/:attachmentId/download` | Download an attachment |
| `DELETE` | `/tickets/:id` | Delete a ticket as an administrator |
| `DELETE` | `/tickets/:id/attachments/:attachmentId` | Delete an attachment |

## 6. Manual API Testing

The development API was started on port `3001` and the main workflows were tested manually.

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

### Current build status

- Confirmed that `npm run build --workspace=@ticketflow/api` completes successfully.
- Confirmed that the build creates `apps/api/dist/main.js`.
- The root workspace `npm run dev` command requires the root `concurrently` dependency to be available. Dependencies were reinstalled from the workspace root to restore it.

## 8. Frontend Implementation

- Added a Next.js operations dashboard for the ticket workflow.
- Added frontend role switching for the temporary client, consultant, and administrator flows.
- Added API-backed ticket creation, ticket queues, ticket details, consultant status transitions, assignment, reports, attachment upload/download/delete, administrator ticket delete, and status history display.
- Aligned the client response flow with the user story:
  - The consultant uses the intervention report to explain what is missing.
  - The client reads that report and uploads the missing attachment.
  - The ticket automatically returns from `EN_ATTENTE_CLIENT` to `EN_COURS`.
- Added supporting read endpoints for ticket modules, consultants, and administrator ticket listing.
- Replaced hardcoded controller user IDs with temporary auth headers:
  - `x-user-id`
  - `x-user-role`
- Enforced role-based ticket access:
  - Clients create tickets, see only their own tickets, and validate resolved tickets.
  - Consultants see assigned tickets and can update status or reports only for assigned tickets.
  - Consultants cannot close resolved tickets; closure is done by client validation.
  - Administrators see all tickets, assign tickets to consultants, and delete tickets.
  - Administrators cannot perform consultant status transitions.

### Latest workflow and UI corrections

- Removed status-transition action buttons from the administrator ticket detail view.
- Restricted the backend status update endpoint to consultants only.
- Removed the consultant `Clôturer` action from the ticket detail view.
- Blocked direct `CLOTURE` status updates through the consultant status endpoint.
- Kept client closure on the dedicated validation endpoint, `PATCH /tickets/:id/validate`.
- Added an administrator-only `Supprimer` action in the ticket detail header.
- Added backend support for administrator ticket deletion with cleanup of related reports, attachments, status history, and uploaded files.
- Verified the changes with:
  - `npx tsc --project apps/api/tsconfig.json --noEmit`
  - `npx tsc --project apps/web/tsconfig.json --noEmit`
  - `npm run build --workspace=@ticketflow/api`

## 9. Current Limitations and Next Steps

- Replace temporary auth headers with `req.user` from the JWT guard provided by the auth work.
- Add email notifications for status changes.
- Add unit and integration tests.
- Continue frontend polishing and add automated coverage for the completed workflows.
