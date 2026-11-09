import type { AuthConfig } from "convex/server";

// Convex verifies the Clerk JWT (template "convex") on every request.
// Set CLERK_JWT_ISSUER_DOMAIN in the Convex deployment environment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
