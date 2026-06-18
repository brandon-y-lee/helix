"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  forgotPasswordAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction,
  updateProfileAction,
} from "@/app/account/actions";
import { idleAuthState, type AuthActionState } from "@/lib/auth/validation";

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? "Working" : children}
    </button>
  );
}

function StatusMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`form-status form-status--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={8}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="password-control__toggle"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function SignInForm({ next, error }: { next: string; error?: string }) {
  const [state, formAction] = useActionState(signInAction, {
    ...idleAuthState,
    ...(error ? { status: "error" as const, message: error } : {}),
  });
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="account-form">
      <input type="hidden" name="next" value={next} />
      <StatusMessage state={state} />
      <div className="form-field">
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "sign-in-email-error" : undefined}
        />
        <FieldError id="sign-in-email-error" message={emailError} />
      </div>
      <PasswordField
        id="sign-in-password"
        name="password"
        label="Password"
        autoComplete="current-password"
        error={passwordError}
      />
      <SubmitButton>Sign in</SubmitButton>
      <div className="account-form__links">
        <Link href="/account/forgot-password">Forgot password</Link>
        <Link href="/account/sign-up">Create account</Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, idleAuthState);
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="account-form">
      <StatusMessage state={state} />
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" autoComplete="given-name" />
        </div>
        <div className="form-field">
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" autoComplete="family-name" />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="sign-up-email">Email</label>
        <input
          id="sign-up-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "sign-up-email-error" : undefined}
        />
        <FieldError id="sign-up-email-error" message={emailError} />
      </div>
      <PasswordField
        id="sign-up-password"
        name="password"
        label="Password"
        autoComplete="new-password"
        error={passwordError}
      />
      <SubmitButton>Create account</SubmitButton>
      <div className="account-form__links">
        <Link href="/account/sign-in">Sign in instead</Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, idleAuthState);
  const emailError = state.fieldErrors?.email;

  return (
    <form action={formAction} className="account-form">
      <StatusMessage state={state} />
      <div className="form-field">
        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "forgot-email-error" : undefined}
        />
        <FieldError id="forgot-email-error" message={emailError} />
      </div>
      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, idleAuthState);
  return (
    <form action={formAction} className="account-form">
      <StatusMessage state={state} />
      <PasswordField
        id="new-password"
        name="password"
        label="New password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <PasswordField
        id="confirm-password"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}

export function ProfileForm({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) {
  const [state, formAction] = useActionState(updateProfileAction, idleAuthState);
  return (
    <form action={formAction} className="account-form account-form--compact">
      <StatusMessage state={state} />
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="profile-first-name">First name</label>
          <input
            id="profile-first-name"
            name="firstName"
            defaultValue={firstName}
            autoComplete="given-name"
          />
        </div>
        <div className="form-field">
          <label htmlFor="profile-last-name">Last name</label>
          <input
            id="profile-last-name"
            name="lastName"
            defaultValue={lastName}
            autoComplete="family-name"
          />
        </div>
      </div>
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="link-button account-signout">
        Sign out
      </button>
    </form>
  );
}
