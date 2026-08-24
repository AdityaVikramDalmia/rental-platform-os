# Docker Deployment

## Supported Topology

The supported production topology is one stateless Next.js container plus external services: WorkOS for authentication and a deployed Convex backend for database, functions, realtime transport, and file storage. This Compose file does not run Convex and does not claim full self-hosting.

For Convex Cloud, deploy functions with `npx convex deploy` and set the three WorkOS secrets plus `INTERNAL_API_SECRET` in the Convex environment. Convex state is managed by Convex Cloud. An independently self-hosted Convex deployment is an advanced topology outside this repository's Compose support; follow Convex's official self-hosting documentation and provide its persistent storage separately.

## Production Authentication

WorkOS is required in production. Set `NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://your-domain/callback` when building the image and register that exact HTTPS callback in WorkOS. `LOCAL_AUTH` is development-only and is not passed to the production container. `/dev/login` returns 404 outside development.

## Environment

Copy `.env.example` to a private production env file and replace every placeholder. The app container needs `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_WEBHOOK_SECRET`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, and `INTERNAL_API_SECRET`. Set the same WorkOS secrets and `INTERNAL_API_SECRET` in Convex. OpenAI, Razorpay, and notification-provider credentials are optional integrations and remain external services.

## Commands

```bash
# Validate Compose configuration with a private env file.
docker compose --env-file .env.production config

# Build and run the application container.
docker compose --env-file .env.production up --build -d

# Verify the public process health endpoint.
curl --fail http://localhost:3000/healthz

# Seed a deployed Convex environment when appropriate.
npx convex run seed:init

# Back up Convex data using the backup/export procedure for your Convex topology.
# Upgrade the app image after rebuilding, then restart it.
docker compose --env-file .env.production up --build -d

# Shut down the application container cleanly.
docker compose --env-file .env.production down
```

Put an HTTPS reverse proxy in front of port 3000. Terminate TLS there, forward the original host/proto headers, and do not expose Convex administration endpoints through this Compose file.
