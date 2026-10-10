import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Button, Card, Input, PageHeader } from '../components/ui';

export default function Account() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({ name: user.name, username: user.username });
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  const [pwd, setPwd] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSaved, setPwdSaved] = useState(false);

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileError('');
    setProfileSaved(false);
    try {
      const { data } = await api.patch('/auth/me', profile);
      updateUser(data.user);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(err.response?.data?.detail || 'Gagal menyimpan profil');
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwdError('');
    setPwdSaved(false);
    if (pwd.new_password !== pwd.confirm_password) {
      setPwdError('Konfirmasi password baru tidak cocok');
      return;
    }
    try {
      await api.post('/auth/change-password', { old_password: pwd.old_password, new_password: pwd.new_password });
      setPwd({ old_password: '', new_password: '', confirm_password: '' });
      setPwdSaved(true);
      setTimeout(() => setPwdSaved(false), 2500);
    } catch (err) {
      setPwdError(err.response?.data?.detail || 'Gagal mengubah password');
    }
  }

  return (
    <div className="max-w-lg">
      <PageHeader title="Akun Saya" subtitle="Perbarui profil dan kelola password Anda" />

      <Card className="mb-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Profil</h3>
        <form onSubmit={handleProfileSubmit}>
          <Input label="Email (tidak dapat diubah)" value={user.email || '-'} disabled className="opacity-60 cursor-not-allowed" />
          <Input label="Nama Lengkap" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          <Input label="Username" value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} required />
          {profileError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{profileError}</p>}
          {profileSaved && <p className="text-sm text-green-600 dark:text-green-400 mb-3">Profil tersimpan.</p>}
          <Button type="submit" className="w-full">Simpan Profil</Button>
        </form>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Ganti Password</h3>
        <form onSubmit={handlePasswordSubmit}>
          <Input
            label="Password Lama"
            type="password"
            value={pwd.old_password}
            onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })}
            required
          />
          <Input
            label="Password Baru"
            type="password"
            value={pwd.new_password}
            onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
            required
            minLength={8}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2 mb-3">
            Minimal 8 karakter, mengandung kombinasi huruf besar dan angka.
          </p>
          <Input
            label="Konfirmasi Password Baru"
            type="password"
            value={pwd.confirm_password}
            onChange={(e) => setPwd({ ...pwd, confirm_password: e.target.value })}
            required
            minLength={8}
          />
          {pwdError && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{pwdError}</p>}
          {pwdSaved && <p className="text-sm text-green-600 dark:text-green-400 mb-3">Password berhasil diubah.</p>}
          <Button type="submit" className="w-full">Ganti Password</Button>
        </form>
      </Card>
    </div>
  );
}
