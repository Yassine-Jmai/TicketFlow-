"use client";

import { FormEvent, useState } from "react";

export default function HomePage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const endpoint = needsPasswordReset
        ? "/auth/reset-password"
        : forgotPassword
          ? "/auth/forgot-password"
          : needsVerification
            ? "/auth/verify-code"
            : isSignUp ? "/users" : "/auth/login";
      const body = needsPasswordReset
        ? { email, code: verificationCode, password }
        : forgotPassword
          ? { email }
          : needsVerification
            ? { email, code: verificationCode }
        : isSignUp
          ? { nom: lastName, prenom: firstName, email, motDePasse: password }
          : { email, motDePasse: password };
      const response = await fetch(
        `/api${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );

      const data = await response.json();
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message[0] : data.message;
        throw new Error(message ?? (isSignUp ? "Unable to create your account." : "Unable to sign in."));
      }

      if (needsPasswordReset) {
        setNeedsPasswordReset(false);
        setForgotPassword(false);
        setVerificationCode("");
        setPassword("");
        setSuccess("Password reset successfully. You can now sign in.");
      } else if (forgotPassword) {
        setNeedsPasswordReset(true);
        setPassword("");
        setSuccess("If an account exists for this email, a reset code has been sent.");
      } else if (isSignUp) {
        setIsSignUp(false);
        setPassword("");
        setNeedsVerification(true);
        setSuccess("Account created. Enter the 6-digit code sent to your email.");
      } else if (needsVerification) {
        setNeedsVerification(false);
        setVerificationCode("");
        setSuccess("Email verified. You can now sign in.");
      } else {
        window.localStorage.setItem("ticketflow_access_token", data.access_token);
        window.localStorage.setItem("ticketflow_user", JSON.stringify(data.user));
        window.location.assign("/dashboard");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <p className="eyebrow">TicketFlow support desk</p>
        <h1>Keep every customer conversation moving.</h1>
        <p className="lede">
          Sign in to manage tickets, follow updates, and keep your support work in one
          place.
        </p>
      </section>

      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-card-header">
          <span className="brand-mark" aria-hidden="true">TF</span>
          <div>
            <p className="card-kicker">{needsPasswordReset || needsVerification ? "Check your inbox" : forgotPassword ? "Account recovery" : isSignUp ? "Get started" : "Welcome back"}</p>
            <h2 id="login-title">
              {needsPasswordReset ? "Set a new password" : needsVerification ? "Verify your email" : forgotPassword ? "Forgot password?" : isSignUp ? "Create your account" : "Sign in to TicketFlow"}
            </h2>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {needsPasswordReset ? (
            <>
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              <label htmlFor="verification-code">Reset code</label>
              <input id="verification-code" name="verificationCode" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter 6-digit code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
              <label htmlFor="password">New password</label>
              <input id="password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            </>
          ) : needsVerification ? (
            <>
              <label htmlFor="verification-code">Verification code</label>
              <input
                id="verification-code"
                name="verificationCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </>
          ) : forgotPassword ? (
            <>
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </>
          ) : (
            <>
          {isSignUp && (
            <>
              <label htmlFor="first-name">First name</label>
              <input
                id="first-name"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder="Your first name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />

              <label htmlFor="last-name">Last name</label>
              <input
                id="last-name"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder="Your last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </>
          )}

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

            </>
          )}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : needsPasswordReset ? "Reset password" : forgotPassword ? "Send reset code" : isSignUp ? "Create account" : "Sign in"}
            <span aria-hidden="true"> -&gt;</span>
          </button>
        </form>

        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {success && <p className="form-message form-success" role="status">{success}</p>}
        <button
          className="mode-switch"
          type="button"
          onClick={() => {
            if (needsPasswordReset || forgotPassword) {
              setNeedsPasswordReset(false);
              setForgotPassword(false);
              setVerificationCode("");
              setPassword("");
            } else if (needsVerification) {
              setNeedsVerification(false);
            } else {
              setIsSignUp(!isSignUp);
            }
            setError("");
            setSuccess("");
          }}
        >
          {needsPasswordReset || forgotPassword || needsVerification ? "Back to sign in" : isSignUp ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
        {!isSignUp && !needsVerification && !forgotPassword && !needsPasswordReset && (
          <button className="mode-switch" type="button" onClick={() => { setForgotPassword(true); setError(""); setSuccess(""); }}>
            Forgot your password?
          </button>
        )}
        <p className="auth-note">Your workspace is protected by secure account access.</p>
      </section>
    </main>
  );
}
