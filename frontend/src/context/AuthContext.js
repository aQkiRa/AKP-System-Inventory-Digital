import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('akp_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('akp_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('akp_user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('akp_token');
        localStorage.removeItem('akp_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('akp_token', data.token);
    localStorage.setItem('akp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('akp_token');
    localStorage.removeItem('akp_user');
    setUser(null);
  }

  function updateUser(nextUser) {
    localStorage.setItem('akp_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }

  const value = useMemo(() => ({ user, loading, login, logout, updateUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
