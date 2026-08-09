import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";

serve(
  {
    fetch: app.fetch,
    port: env.API_PORT,
  },
  (info) => {
    console.log(`Tarati API listening on http://localhost:${info.port}`);
  }
);
