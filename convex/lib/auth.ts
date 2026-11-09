import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Every permission check happens here, on the server. The UI only hides
 * buttons; these helpers are what actually enforce the rules.
 */

export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to continue." });
  }
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Admins only." });
  }
  return user;
}

export function forbidden(message: string): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

export function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

export function notFound(message = "Not found."): never {
  throw new ConvexError({ code: "NOT_FOUND", message });
}
