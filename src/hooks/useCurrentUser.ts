"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Makes sure the signed-in Clerk user has a row in Convex, then returns it.
 * `undefined` while loading, `null` when signed out.
 */
export function useCurrentUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store().then(() => {
      if (!cancelled) setStored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);

  const me = useQuery(api.users.me, isAuthenticated && stored ? {} : "skip");

  if (isLoading || (isAuthenticated && (!stored || me === undefined))) return undefined;
  if (!isAuthenticated) return null;
  return me;
}
