import React, { createContext, useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authClient } from "../lib/authClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Better Auth's reactive session store: { data, isPending, error, refetch }.
  const session = authClient.useSession();

  const value = {
    user: session.data?.user ?? null,
    session: session.data?.session ?? null,
    isAuthenticated: Boolean(session.data?.user),
    isPending: session.isPending,
    refetch: session.refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

// Route guard: redirects to /login (remembering where you came from) when the
// user isn't signed in.
export const RequireAuth = ({ children }) => {
  const { isAuthenticated, isPending } = useAuth();
  const location = useLocation();

  if (isPending) {
    return <div className="auth-loading">Loading…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};
