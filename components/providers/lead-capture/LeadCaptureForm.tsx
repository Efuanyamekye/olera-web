"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { LeadCaptureFormData } from "./types";
import { SmsConsentDisclosure } from "@/components/sms/SmsConsentDisclosure";

interface LeadCaptureFormProps {
  isLoggedIn: boolean;
  userEmail: string;
  userName: string;
  userPhone: string;
  onSubmit: (formData: LeadCaptureFormData) => void;
  submitting: boolean;
  error?: string | null;
}

export default function LeadCaptureForm({
  isLoggedIn,
  userEmail,
  userName,
  userPhone,
  onSubmit,
  submitting,
  error,
}: LeadCaptureFormProps) {
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [phone, setPhone] = useState(userPhone);
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Track which fields have been pre-filled (per-field, not global)
  const preFilledFields = useRef<Set<string>>(new Set());

  // Pre-fill from auth data when it becomes available (async auth loading)
  // Only pre-fill if user hasn't already typed in the field
  useEffect(() => {
    if (userName && !preFilledFields.current.has("name") && !name) {
      preFilledFields.current.add("name");
      setName(userName);
    }
  }, [userName, name]);

  useEffect(() => {
    if (userEmail && !preFilledFields.current.has("email") && !email) {
      preFilledFields.current.add("email");
      setEmail(userEmail);
    }
  }, [userEmail, email]);

  useEffect(() => {
    if (userPhone && !preFilledFields.current.has("phone") && !phone) {
      preFilledFields.current.add("phone");
      setPhone(userPhone);
    }
  }, [userPhone, phone]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = useCallback(() => {
    setLocalError(null);

    // Honeypot check
    if (honeypot) {
      return;
    }

    // Validate required fields
    if (!name.trim()) {
      setLocalError("Please enter your name.");
      return;
    }

    if (!email.trim()) {
      setLocalError("Please enter your email address.");
      return;
    }

    if (!validateEmail(email.trim())) {
      setLocalError("Please enter a valid email address.");
      return;
    }

    onSubmit({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      message: message.trim(),
    });
  }, [name, email, phone, message, honeypot, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !submitting && e.target instanceof HTMLInputElement) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, submitting]
  );

  const displayError = error || localError;
  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && !submitting;

  return (
    <div className="space-y-4">
      {/* Name field */}
      <div>
        <label htmlFor="lead-name" className="block text-sm font-medium text-gray-700 mb-1.5">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="lead-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Your full name"
          autoComplete="name"
          className="w-full px-4 py-3 border border-gray-300 rounded-[10px] text-[15px] text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
        />
      </div>

      {/* Email field */}
      <div>
        <label htmlFor="lead-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="lead-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="your@email.com"
          autoComplete="email"
          disabled={isLoggedIn && !!userEmail}
          className={`w-full px-4 py-3 border border-gray-300 rounded-[10px] text-[15px] text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all ${
            isLoggedIn && userEmail ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
          }`}
        />
      </div>

      {/* Phone field (optional) */}
      <div>
        <label htmlFor="lead-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
          Phone <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="lead-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="(555) 123-4567"
          autoComplete="tel"
          className="w-full px-4 py-3 border border-gray-300 rounded-[10px] text-[15px] text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all"
        />
      </div>

      {/* Message field (optional) */}
      <div>
        <label htmlFor="lead-message" className="block text-sm font-medium text-gray-700 mb-1.5">
          Message <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="lead-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your care needs..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-[10px] text-[15px] text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all resize-none"
        />
      </div>

      {/* Honeypot field */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ display: "none" }}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {/* Error message */}
      {displayError && (
        <p className="text-sm text-red-600" role="alert">
          {displayError}
        </p>
      )}

      {/* SMS consent disclosure (carrier-required at point of phone collection) */}
      <SmsConsentDisclosure />

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3.5 rounded-[10px] text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
          canSubmit
            ? "bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-700"
            : "bg-gray-100 text-gray-400 cursor-default"
        }`}
      >
        {submitting && (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {submitting ? "Sending..." : "Send Message"}
      </button>

      {/* Privacy note */}
      <p className="text-xs text-gray-500 text-center">
        Your information is kept private.
      </p>
    </div>
  );
}
