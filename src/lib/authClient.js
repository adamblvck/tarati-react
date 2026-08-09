import { createAuthClient } from "better-auth/react";
import { getApiBaseUrl } from "../config/apiConfig";

// Same-origin in dev (via the CRA proxy); the API origin in production.
const baseURL = getApiBaseUrl() || window.location.origin;

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: { credentials: "include" },
});

export const { signIn, signUp, signOut, useSession } = authClient;
