import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  sanitizeAddress,
  sanitizeHotline,
  sanitizePhoneNumber,
  sanitizeUsername
} from './inputSanitizers';
import {
  validateAddress,
  validateHotline,
  validatePhoneNumber,
  validateStrongPassword,
  validateUsername
} from './inputValidators';
import { API_BASE_URL } from "../../config/api";

export default function AccountSettings() {
  const navigate = useNavigate();
  useEffect(() => {
      const storedRole = localStorage.getItem('role');
      if (!storedRole) {
        navigate('/'); // redirect to login
      }
    }, [navigate]);

  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);

  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const BASE_URL = API_BASE_URL;

  useEffect(() => {
    fetch(`${BASE_URL}/api/barangays/me`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        const loaded = {
          _id: data._id,
          username: data.username || '',
          phoneNumber: data.phoneNumber || '',
          hotline: data.hotline || '',
          address: data.address || '',
          password: '',
          oldPasswordHash: data.password || '' // for comparison safeguard
        };

        setForm(loaded);
        setOriginal(loaded);
      });
  }, []);

  if (!form) return <p>Loading account...</p>;

  const hasChanges = () => (
    form.username !== original.username ||
    form.phoneNumber !== original.phoneNumber ||
    form.hotline !== original.hotline ||
    form.address !== original.address ||
    form.password.length > 0
  );

  const updateAccount = async () => {
    setError('');

    if (!hasChanges()) {
      setError('No changes detected.');
      return;
    }

    const usernameError = validateUsername(form.username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    const phoneError = validatePhoneNumber(form.phoneNumber);
    if (phoneError) {
      setError(phoneError);
      return;
    }

    const hotlineError = validateHotline(form.hotline);
    if (hotlineError) {
      setError(hotlineError);
      return;
    }

    const addressError = validateAddress(form.address);
    if (addressError) {
      setError(addressError);
      return;
    }

    if (form.password) {
      const passwordError = validateStrongPassword(form.password);
      if (passwordError) {
        setError(passwordError);
        return;
      }

      if (form.password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    const payload = { ...form };
    delete payload._id;
    delete payload.oldPasswordHash;

    if (!payload.password) delete payload.password;

    const res = await fetch(
      `${BASE_URL}/api/auth/update/${form._id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      }
    );

    if (res.ok) {
      alert('Account updated successfully');

      setOriginal({ ...form, password: '' });
      setForm({ ...form, password: '' });
      setConfirmPassword('');
      navigate('/');
    } else {
      alert('New password must be different from old password');
      console.log(res)
      console.log(confirmPassword)
      console.log(form.password)
    }
  };

  return (
    <div>
      <h2>Account Settings</h2>

      <div style={box}>

        <label style={label}>Username</label>
        <input
          value={form.username}
          onChange={e => setForm({ ...form, username: sanitizeUsername(e.target.value) })}
        />

        <label style={label}>Phone Number</label>
        <input
          value={form.phoneNumber}
          onChange={e => setForm({ ...form, phoneNumber: sanitizePhoneNumber(e.target.value) })}
          placeholder="09XXXXXXXXX"
        />

        <label style={label}>Hotline(Optional)</label>
        <input
          value={form.hotline}
          onChange={e => setForm({ ...form, hotline: sanitizeHotline(e.target.value) })}
        />

        <label style={label}>Address</label>
        <input
          value={form.address}
          onChange={e => setForm({ ...form, address: sanitizeAddress(e.target.value) })}
        />

        <label style={label}>New Password</label>
        <input
          type="password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
          placeholder="Keep empty to not change"
        />

        <label style={label}>Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          placeholder='Re-enter new password'
        />

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button onClick={updateAccount}>
          Update Account
        </button>
      </div>

      <button style={{ marginTop: 20 }} onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
}

const box = {
  border: '1px solid #ddd',
  padding: 16,
  maxWidth: 420,
  borderRadius: 6
};

const label = {
  display: 'block',
  marginTop: 12,
  marginBottom: 4,
  fontWeight: 'bold'
};
