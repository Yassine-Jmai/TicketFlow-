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
