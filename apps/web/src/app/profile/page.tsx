"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  photoUrl?: string | null;
  role: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    const savedUser = window.localStorage.getItem("ticketflow_user");
    if (savedUser) {
      const savedUserData = JSON.parse(savedUser) as User;
      const token = window.localStorage.getItem("ticketflow_access_token");
      setUser(savedUserData);
      setFirstName(savedUserData.prenom);
      setLastName(savedUserData.nom);
      setEmail(savedUserData.email);
      setPhotoUrl(savedUserData.photoUrl ?? "");

      if (token && savedUserData.id) {
        fetch(`${apiBaseUrl}/users/${savedUserData.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((currentUser: User | null) => {
            if (!currentUser) return;
            setUser(currentUser);
            setFirstName(currentUser.prenom);
            setLastName(currentUser.nom);
            setEmail(currentUser.email);
            setPhotoUrl(currentUser.photoUrl ?? "");
            window.localStorage.setItem("ticketflow_user", JSON.stringify(currentUser));
          })
          .catch(() => undefined);
      }
    }
  }, [apiBaseUrl]);

  function startEditing() {
    setMessage("");
    setError("");
    setIsEditing(true);
  }

  function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(`${apiBaseUrl}/users/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.localStorage.getItem("ticketflow_access_token") ?? ""}`
        },
        body: JSON.stringify({
          prenom: firstName,
          nom: lastName,
          email,
          ...(photoUrl ? { photoUrl } : {})
        })
      });
      const data = await response.json();

      if (!response.ok) {
        const apiMessage = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(apiMessage ?? "Unable to update your profile.");
      }

      setUser(data);
      window.localStorage.setItem("ticketflow_user", JSON.stringify(data));
      window.location.assign("/profile");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update your profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="profile-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">TF</span>
          <span>TicketFlow</span>
        </Link>
        <Link className="back-link" href="/dashboard">Back to dashboard</Link>
      </header>

      <section className="profile-content" aria-labelledby="profile-title">
        <div className="profile-heading">
          <p className="eyebrow">Account settings</p>
          <h1 id="profile-title">Your profile</h1>
          <p className="lede">Review the account details connected to your TicketFlow workspace.</p>
        </div>

        <section className="profile-card">
          <div className="profile-card-topline">
            {(isEditing ? photoUrl : user?.photoUrl) ? (
              <img className="profile-avatar profile-photo" src={isEditing ? photoUrl : user?.photoUrl ?? ""} alt="Profile" />
            ) : (
              <div className="profile-avatar" aria-hidden="true">
                {user ? `${user.prenom[0]}${user.nom[0]}` : "TF"}
              </div>
            )}
            {!isEditing && <button className="edit-profile-button" type="button" onClick={startEditing}>Edit profile</button>}
          </div>

          {isEditing ? (
            <form className="profile-form" onSubmit={saveProfile}>
              <label htmlFor="profile-first-name">First name</label>
              <input id="profile-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
              <label htmlFor="profile-last-name">Last name</label>
              <input id="profile-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
              <label htmlFor="profile-email">Email address</label>
              <input id="profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label htmlFor="profile-photo">Profile image</label>
              <input id="profile-photo" type="file" accept="image/*" onChange={selectPhoto} />
              <div className="profile-form-actions">
                <button className="save-profile-button" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save changes"}</button>
                <button className="cancel-profile-button" type="button" onClick={() => setIsEditing(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="profile-details">
              <div className="profile-detail"><span>Full name</span><strong>{user ? `${user.prenom} ${user.nom}` : "Loading..."}</strong></div>
              <div className="profile-detail"><span>Email address</span><strong>{user?.email ?? "Loading..."}</strong></div>
              <div className="profile-detail"><span>Account role</span><strong>{user?.role ?? "Loading..."}</strong></div>
            </div>
          )}
        </section>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </section>
    </main>
  );
}