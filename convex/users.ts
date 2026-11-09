import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Called by the client right after sign-in. Creates or refreshes the user row
 * from the verified Clerk token. Role is never taken from the client: new users
 * are "user", unless their email is listed in the ADMIN_EMAILS env variable.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Called store without authentication.");

    const email = identity.email?.toLowerCase();
    const name =
      identity.givenName?.trim() ||
      identity.name?.trim().split(" ")[0] ||
      email?.split("@")[0] ||
      "Neighbor";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch(existing._id, { name, email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: email && adminEmails().has(email) ? "admin" : "user",
      trustedLender: false,
    });
  },
});

/** The signed-in user's own profile (never exposes other users' emails). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});
