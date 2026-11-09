import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk only needs to see each request here. Access control is not done by path
// matching: the dashboard layout redirects signed-out visitors, and every Convex
// function checks the caller's identity and role on the server.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
