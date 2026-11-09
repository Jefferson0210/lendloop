import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { forbidden, invalid, notFound, requireUser } from "./lib/auth";
import { toolStatus } from "./lib/availability";
import { category, condition, LIMITS } from "./lib/validators";
import { enqueueLoanEvent } from "./lib/outbox";

function cleanText(value: string, max: number, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) invalid(`${field} is required.`);
  if (trimmed.length > max) invalid(`${field} must be at most ${max} characters.`);
  return trimmed;
}

/**
 * Public landing page list. No auth required, so it returns the bare minimum:
 * name and category of tools that are available today. No owner details.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").collect();
    const result = [];
    for (const tool of tools) {
      if ((await toolStatus(ctx, tool._id)) === "available") {
        result.push({ _id: tool._id, name: tool.name, category: tool.category });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Signed-in catalog: every tool with its availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tools = args.category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .collect()
      : await ctx.db.query("tools").collect();

    const rows = await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          status: await toolStatus(ctx, tool._id),
          isMine: tool.ownerId === me._id,
          owner: { name: owner?.name ?? "Neighbor", trusted: owner?.trustedLender ?? false },
        };
      }),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .collect();
    return await Promise.all(
      tools.map(async (tool) => {
        const loans = await ctx.db
          .query("loans")
          .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
          .collect();
        return {
          ...tool,
          status: await toolStatus(ctx, tool._id),
          pendingRequests: loans.filter((l) => l.status === "requested").length,
        };
      }),
    );
  },
});

const toolFields = {
  name: v.string(),
  category,
  condition,
  description: v.string(),
};

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      name: cleanText(args.name, LIMITS.toolName, "Name"),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, LIMITS.description, "Description"),
    });
  },
});

/** Only the owner can edit a listing (admins can remove, not edit). */
export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...fields }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) notFound("Tool not found.");
    if (tool.ownerId !== me._id) forbidden("You can only edit your own listings.");
    await ctx.db.patch(toolId, {
      name: cleanText(fields.name, LIMITS.toolName, "Name"),
      category: fields.category,
      condition: fields.condition,
      description: cleanText(fields.description, LIMITS.description, "Description"),
    });
  },
});

/**
 * Owners can delete their own listing unless it is currently lent out.
 * Admins can delete any listing; open requests and loans on it are cancelled
 * and the affected people are notified.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) notFound("Tool not found.");
    const isOwner = tool.ownerId === me._id;
    const isAdmin = me.role === "admin";
    if (!isOwner && !isAdmin) forbidden("You can only delete your own listings.");

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    const open = loans.filter((l) => l.status === "requested" || l.status === "approved");
    if (!isAdmin && open.some((l) => l.status === "approved")) {
      invalid("This tool is lent out or reserved. Mark the loan as returned before deleting it.");
    }

    for (const loan of open) {
      await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: Date.now() });
      await enqueueLoanEvent(ctx, { ...loan, status: "cancelled" }, "loan.cancelled", {
        notify: "borrower",
      });
    }
    await ctx.db.delete(toolId);
  },
});
