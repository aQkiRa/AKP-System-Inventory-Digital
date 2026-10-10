import axios from 'axios';

// Falls back to whatever host the browser actually used to load the page
// (localhost, a LAN IP over WiFi, a LAN IP over Ethernet, a real domain, ...)
// instead of a hardcoded "localhost" that only works from the machine
// running Docker itself. Set REACT_APP_BACKEND_URL explicitly only when the
// API lives on a different host than the frontend (e.g. behind a reverse proxy).
const DEFAULT_BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:5000`;

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_URL;
export const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || BACKEND_URL;

const api = axios.create({ baseURL: `${BACKEND_URL}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('akp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      if (err.response.data?.code === 'account_suspended') {
        try { sessionStorage.setItem('akp_login_notice', err.response.data.detail); } catch (e) { /* storage unavailable */ }
      }
      localStorage.removeItem('akp_token');
      localStorage.removeItem('akp_user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Export endpoints require the Bearer token, which a plain <a href> link
// can't send - so fetch the file through axios and hand it to the browser.
export async function downloadExport(path, params, filename) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default api;
