/* eslint-disable react-refresh/only-export-components --
   This file intentionally exports both the AuthProvider component and the
   useAuth hook, since they're tightly coupled and meant to be imported
   together. */
import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  // Starts true only if there's a token to verify, so we don't briefly
  // flash the "logged out" UI while a valid session is still loading.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("token")));

  // On mount: if a token is already in localStorage, try to restore the
  // session by fetching the current user. If that fails (expired/invalid
  // token), clear it out.
  useEffect(() => {
    const existingToken = localStorage.getItem("token");
    if (!existingToken) return;

    const restoreSession = async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.user);
        setToken(existingToken);
      } catch (error) {
        console.error("Failed to restore session:", error);
        localStorage.removeItem("token");
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = (newToken, newUser) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Convenience hook for consuming the auth context.
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
