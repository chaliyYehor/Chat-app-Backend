# Pulse Backend

This repository contains the backend for Pulse, a pet project for real-time chat and voice and video calls. The frontend is in a [separate repository](https://github.com/chaliyYehor/Pulse-frontend).

## Stack

Node.js, TypeScript, Express, Socket.IO, Better Auth, Drizzle ORM, Neon PostgreSQL, and LiveKit.

## Requirements

Node.js 20 or later, a PostgreSQL database (the app uses Neon), and accounts or credentials for LiveKit, Resend, Arcjet, Cloudinary, and GitHub and Google OAuth apps.

## Setup

```sh
git clone https://github.com/chaliyYehor/Pulse-backend.git
cd Chat-app-Backend
npm install
cp .env.example .env
```

Fill in `.env`, then run the database migrations and start the development server:

```sh
npm run db:migrate
npm run dev
```

## Environment variables

- `DATABASE_URL`: PostgreSQL connection string used by Neon and Drizzle.
- `PORT`: HTTP server port; defaults to `5000`.
- `SERVER_URL`: backend URL used by the health check job; defaults to localhost and `PORT`.
- `CLIENT_URL`: frontend origin; defaults to `http://localhost:5173`.
- `VERCEL_CLIENT_URL`: additional allowed frontend origin.
- `BETTER_AUTH_URL`: backend origin used by Better Auth.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth credentials.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: GitHub OAuth credentials.
- `RESEND_API_KEY`, `RESEND_EMAIL`: Resend API key and sender address for verification and password reset emails.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: LiveKit server address and credentials used to issue call tokens.
- `ARCJET_KEY`: Arcjet project key; required when the server starts.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary credentials for image operations.
- `CREATOR_EMAIL`: email used by the creator lookup endpoint.
- `ENABLE_DOCS`: set to `true` to enable Swagger UI in production; docs are enabled outside production.
- `NODE_ENV`: controls the production check for enabling API docs.

## Scripts

- `npm run dev`: run `tsx watch ./src/server.ts`.
- `npm run build`: compile TypeScript with `tsc`.
- `npm start`: run `node ./build/server.js`.
- `npm run db:generate`: generate migration files from the schema.
- `npm run db:migrate`: run Drizzle Kit migrations.

## API docs

Swagger UI is served at `/docs`. It is enabled outside production and in production only when `ENABLE_DOCS=true`. The OpenAPI spec is `docs/openapi.yaml`. WebSocket events are not covered by OpenAPI; there is no `docs/API.md`.

## Security

Arcjet protects HTTP requests with Shield, bot detection, and a sliding-window rate limit, all configured in `LIVE` mode. It also checks Socket.IO connection handshakes; per-event Socket.IO limits are implemented separately in memory.

## Auth and calls

Better Auth is mounted under `/api/auth` with email/password, GitHub, and Google sign-in; email verification is required. Call handlers in `src/socket/handlers` issue LiveKit credentials through Socket.IO events. HTTP routes are in `src/routers`, auth setup is in `src/lib/auth.ts`, and database schema and connection code are in `src/db`.

Set the GitHub OAuth callback URL to `${BETTER_AUTH_URL}/api/auth/callback/github` and the Google OAuth callback URL to `${BETTER_AUTH_URL}/api/auth/callback/google`.

## Deployment

For Render, use `npm install && npm run build` as the build command and `npm start` as the start command. Set `DATABASE_URL`, `BETTER_AUTH_URL`, `CLIENT_URL`, `VERCEL_CLIENT_URL`, `ARCJET_KEY`, the Resend variables, LiveKit variables, and GitHub and Google OAuth credentials. Set the Cloudinary variables if using image features, and `SERVER_URL` to the deployed backend URL for the health check job. Neon provides the PostgreSQL database. This repository has no Render config file.

See the [LICENSE](LICENSE) file.
