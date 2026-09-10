"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type User = {
  id: string;
  prenom: string;
  nom: string;
  photoUrl?: string | null;
  email: string;
  role: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    const accessToken = window.localStorage.getItem("ticketflow_access_token");
    if (!accessToken) {
      window.location.replace("/");
      return;
    }

    const handlePageShow = () => {
      if (!window.localStorage.getItem("ticketflow_access_token")) {
        window.location.replace("/");
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    const savedUser = window.localStorage.getItem("ticketflow_user");
    if (savedUser) {
      const savedUserData = JSON.parse(savedUser) as User;
      setUser(savedUserData);

      fetch(`${apiBaseUrl}/users/${savedUserData.id}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((currentUser: User | null) => {
          if (!currentUser) return;
          setUser(currentUser);
          window.localStorage.setItem("ticketflow_user", JSON.stringify(currentUser));
        })
        .catch(() => undefined);
    }

    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [apiBaseUrl]);

  function signOut() {
    window.localStorage.removeItem("ticketflow_access_token");
    window.localStorage.removeItem("ticketflow_user");
    window.location.replace("/");
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="brand-mark" aria-hidden="true">TF</span>
          <span>TicketFlow</span>
        </div>
        <nav className="dashboard-nav" aria-label="Main navigation">
          <Link className="dashboard-avatar-link" href="/profile" aria-label="Open profile">
            {user?.photoUrl ? (
              <img className="dashboard-avatar" src={user.photoUrl} alt="" />
            ) : (
              <span className="dashboard-avatar dashboard-avatar-initials" aria-hidden="true">
                {user ? `${user.prenom[0]}${user.nom[0]}` : "TF"}
              </span>
            )}
          </Link>
          <Link className="profile-link" href="/profile">Profile</Link>
          {user?.role === "ADMINISTRATEUR" && (
            <Link className="profile-link" href="/client-management">Client management</Link>
          )}
          <button className="sign-out-button" type="button" onClick={signOut}>Sign out</button>
        </nav>
      </header>

      <section className="dashboard-content">
        <div className="dashboard-welcome">
          <p className="eyebrow">Customer workspace</p>
          <h1>Good to see you{user ? `, ${user.prenom}` : ""}.</h1>
          <p className="lede">Track your support requests and stay close to every update.</p>
        </div>

        <div className="dashboard-stats" aria-label="Ticket summary">
          <article className="dashboard-stat dashboard-stat-highlight">
            <span>Open tickets</span>
            <strong>0</strong>
            <small>Nothing needs your attention yet</small>
          </article>
          <article className="dashboard-stat">
            <span>Waiting for you</span>
            <strong>0</strong>
            <small>Replies requested from your team</small>
          </article>
          <article className="dashboard-stat">
            <span>Resolved</span>
            <strong>0</strong>
            <small>Successfully completed requests</small>
          </article>
        </div>

        <section className="dashboard-empty-state">
          <span className="empty-icon" aria-hidden="true">+</span>
          <div>
            <h2>No tickets yet</h2>
            <p>When you create a support request, its updates will appear here.</p>
          </div>
          <button type="button" disabled>New ticket</button>
        </section>

      </section>
    </main>
  );
}