import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getToken,
  fetchCurrentUser,
  login as loginRequest,
  registerHospital as registerRequest,
  logout as clearSession,
} from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await fetchCurrentUser();
      setUser(profile);
    } catch (err) {
      // Only a real 401 means the token itself is invalid/expired — clear it.
      // Anything else (backend down, 502/503, network hiccup) should NOT
      // wipe a perfectly valid token; just leave it and let the user retry.
      if (err.status === 401) {
        clearSession();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // If any API call comes back 401 (expired/invalid token), httpClient.js
  // fires this event. Reacting to it here means every page automatically
  // gets logged out and redirected (via ProtectedRoute) — no page needs
  // its own 401-handling logic.
  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setUser(null);
    };
    window.addEventListener("medbridge:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("medbridge:unauthorized", handleUnauthorized);
  }, []);

  const login = async (email, password) => {
    const result = await loginRequest(email, password);
    setUser(result.user);
    return result.user;
  };

  const registerHospital = async (data) => {
    const result = await registerRequest(data);
    setUser(result.user);
    return result.user;
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, registerHospital, logout, refreshUser: loadSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
