"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type User = {
  id: string;
  prenom: string;
  nom: string;
  photoUrl?: string | null;
  email: string;
  role: string;
};

const roles = ["CLIENT", "CONSULTANT"] as const;

export default function ClientManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingRoleId, setSavingRoleId] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    const savedUser = window.localStorage.getItem("ticketflow_user");
    const token = window.localStorage.getItem("ticketflow_access_token");
    if (!savedUser || !token) return;

    const currentUser = JSON.parse(savedUser) as User;

    fetch(`${apiBaseUrl}/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load users.");
        return response.json() as Promise<User[]>;
      })
      .then(setUsers)
      .catch((requestError: Error) => setError(requestError.message));
  }, [apiBaseUrl]);

  async function changeRole(userId: string, role: string) {
    setSavingRoleId(userId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${apiBaseUrl}/users/${userId}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.localStorage.getItem("ticketflow_access_token") ?? ""}`
        },
        body: JSON.stringify({ role })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to update this role.");

      setUsers((currentUsers) => currentUsers.map((item) => item.id === data.id ? data : item));
      setNotice(`Role updated for ${data.prenom} ${data.nom}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update this role.");
    } finally {
      setSavingRoleId("");
    }
  }

  async function deactivateUser(managedUser: User) {
    if (!window.confirm(`Deactivate the account for ${managedUser.prenom} ${managedUser.nom}? Ticket and status history will be preserved.`)) return;

    setDeletingUserId(managedUser.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${apiBaseUrl}/users/${managedUser.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${window.localStorage.getItem("ticketflow_access_token") ?? ""}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to deactivate this account.");

      setUsers((currentUsers) => currentUsers.filter((item) => item.id !== managedUser.id));
      setNotice(`Account deactivated for ${managedUser.prenom} ${managedUser.nom}. History was preserved.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to deactivate this account.");
    } finally {
      setDeletingUserId("");
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">TF</span>
          <span>TicketFlow</span>
        </Link>
        <Link className="back-link" href="/dashboard">Back to dashboard</Link>
      </header>

      <section className="dashboard-content management-page-content">
        <div className="dashboard-welcome">
          <p className="eyebrow">Administration</p>
          <h1>Client management</h1>
          <p className="lede">Assign the correct role to every TicketFlow account.</p>
        </div>

        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {notice && <p className="form-message form-success" role="status">{notice}</p>}
        <section className="admin-user-panel" aria-label="Client management list">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Workspace accounts</p>
              <h2>People with access</h2>
            </div>
            <span className="admin-count">{users.length} {users.length === 1 ? "account" : "accounts"}</span>
          </div>
          <div className="admin-user-list">
            {users.map((managedUser) => (
              <div className="admin-user-row" key={managedUser.id}>
                <div className="admin-user-identity">
                  {managedUser.photoUrl ? (
                    <img className="admin-user-avatar" src={managedUser.photoUrl} alt="" />
                  ) : (
                    <span className="admin-user-avatar admin-user-initials" aria-hidden="true">
                      {managedUser.prenom[0]}{managedUser.nom[0]}
                    </span>
                  )}
                  <div>
                    <strong>{managedUser.prenom} {managedUser.nom}</strong>
                    <span>{managedUser.email}</span>
                  </div>
                </div>
                <div className="admin-user-actions">
                  <select
                    aria-label={`Role for ${managedUser.prenom} ${managedUser.nom}`}
                    value={managedUser.role}
                    disabled={savingRoleId === managedUser.id || deletingUserId === managedUser.id}
                    onChange={(event) => changeRole(managedUser.id, event.target.value)}
                  >
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={savingRoleId === managedUser.id || deletingUserId === managedUser.id}
                    onClick={() => deactivateUser(managedUser)}
                  >
                    {deletingUserId === managedUser.id ? "Deactivating..." : "Deactivate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
