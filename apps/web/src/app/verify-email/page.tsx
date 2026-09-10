"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }

    fetch(`http://localhost:3001/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.verified) throw new Error(data.message ?? "This verification link is invalid or expired.");
        setStatus("success");
        setMessage("Your email is verified. You can sign in now.");
      })
      .catch((error: Error) => {
        setStatus("error");
        setMessage(error.message);
      });
  }, []);

  return (
    <main className="auth-page verification-page">
      <section className="auth-intro">
        <p className="eyebrow">TicketFlow support desk</p>
        <h1>{status === "success" ? "You are verified." : "Email verification"}</h1>
        <p className="lede">{message}</p>
      </section>
      <section className="auth-card verification-card">
        <span className={`verification-icon verification-${status}`} aria-hidden="true">
          {status === "loading" ? "..." : status === "success" ? "OK" : "!"}
        </span>
        <h2>{status === "success" ? "Account ready" : status === "error" ? "Verification failed" : "One moment"}</h2>
        <Link className="verification-link" href="/">Return to sign in</Link>
      </section>
    </main>
  );
}