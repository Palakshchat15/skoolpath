"use client";

import { useState } from "react";
import { signInUser, hasFirebaseConfig } from "@skoolpath/shared";
import BusRouteAnimation from "../components/BusRouteAnimation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const firebaseReady = hasFirebaseConfig();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseReady) {
      setError("Firebase config is missing.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signInUser(email, password);
      window.location.href = "/";
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  if (!firebaseReady) {
    return (
      <div className="loginPage">
        <div className="loginCard">
          <div className="loginHeader">
            <div className="loginBrandMark" style={{ background: 'transparent', border: 'none' }}>
              <img src="/logo.png" alt="logo" style={{ height: 60, objectFit: 'contain' }} />
            </div>
            <div>
              <h1 className="loginTitle">School Admin</h1>
              <p className="loginSubtitle">Firebase configuration is missing for the school admin website.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="loginPage">
      {/* Left panel — animated bus route */}
      <div className="loginHero">
        <div className="glowingOrb1"></div>
        <div className="glowingOrb2"></div>


        {/* Floating Logo */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
          <img className="loginLogoAnim" src="/logo.png" alt="SkoolPath Logo" style={{ width: '80%', height: '80%', objectFit: 'contain', opacity: 1 }} />
        </div>

        {/* Logo background decoration */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.15, pointerEvents: "none", zIndex: 1 }}>
          <img src="/logo.png" alt="Decoration" style={{ width: "110%", height: "110%", objectFit: "contain", filter: "blur(60px)" }} />
        </div>

        <div className="loginBusTrack">
          <div className="animatedBus">🚌</div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="loginCard">
        <div className="loginHeader">
          <h1 className="loginTitle">Welcome Back</h1>
          <p className="loginSubtitle">Sign in with your school admin credentials to access the dashboard.</p>
        </div>

        <form className="loginForm" onSubmit={handleLogin}>
          <div className="formGroup">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="loginInput"
              placeholder="admin@school.edu"
            />
          </div>
          <div className="formGroup">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="loginInput"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="loginError">{error}</p>}
          <button type="submit" disabled={loading} className="loginButton">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="loginFooter">
          <a href="#" className="loginLink">Forgot Password?</a>
          <p>© 2026 SkoolPath. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
