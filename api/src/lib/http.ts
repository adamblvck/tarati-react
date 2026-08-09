import type { MiddlewareHandler } from "hono";

export type AppVariables = {
  userId: string | null;
};

export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
