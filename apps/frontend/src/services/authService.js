import { request, setToken, getToken } from "./httpClient";
import { mapUser } from "../utils/mappers";

export { getToken, setToken };

export async function login(email, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return { token: result.token, user: mapUser(result.user) };
}

export async function registerHospital(data) {
  const result = await request("/auth/register-hospital", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setToken(result.token);
  return { token: result.token, user: mapUser(result.user) };
}

export async function fetchCurrentUser() {
  const user = await request("/auth/me");
  return mapUser(user);
}

export function logout() {
  setToken(null);
}
