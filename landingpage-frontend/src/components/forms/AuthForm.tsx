"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
} from "lucide-react";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === "register";
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    // Simulated auth — connect to your authentication API here.
    setTimeout(() => setStatus("success"), 1200);
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-10 text-center"
      >
        <CheckCircle2 className="h-14 w-14 text-brand-yellow-dark" />
        <h3 className="text-xl font-bold text-brand-ink dark:text-white">
          {isRegister ? "Account Created!" : "Welcome Back!"}
        </h3>
        <p className="max-w-sm text-sm text-brand-grey dark:text-gray-400">
          {isRegister
            ? "Your account has been created. Our team will verify your details and activate your dashboard shortly."
            : "You have signed in successfully. Redirecting you to your dashboard..."}
        </p>
        <Link href="/" className="btn-secondary mt-2">
          Back to Home
        </Link>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {isRegister && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <IconField
            icon={User}
            label="Full Name"
            name="name"
            placeholder="Your full name"
            required
          />
          <IconField
            icon={Phone}
            label="Mobile Number"
            name="phone"
            type="tel"
            pattern="[0-9]{10}"
            placeholder="10-digit number"
            required
          />
        </div>
      )}

      <IconField
        icon={Mail}
        label="Email Address"
        name="email"
        type="email"
        placeholder="you@example.com"
        required
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-brand-ink dark:text-gray-200"
        >
          Password
        </label>
        <div className="relative">
          <Lock
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-grey-light"
          />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            placeholder="••••••••"
            className="input-base pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-grey-light hover:text-brand-yellow-dark"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {!isRegister && (
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-brand-grey dark:text-gray-400">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            Remember me
          </label>
          <Link
            href="#"
            className="font-medium text-brand-yellow-dark hover:underline dark:text-brand-yellow"
          >
            Forgot password?
          </Link>
        </div>
      )}

      {isRegister && (
        <label className="flex items-start gap-2 text-xs text-brand-grey dark:text-gray-400">
          <input
            type="checkbox"
            required
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-yellow focus:ring-brand-yellow"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="text-brand-yellow-dark hover:underline dark:text-brand-yellow">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy-policy" className="text-brand-yellow-dark hover:underline dark:text-brand-yellow">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      )}

      <button type="submit" disabled={status === "loading"} className="btn-primary w-full">
        {status === "loading" ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {isRegister ? "Creating account..." : "Signing in..."}
          </>
        ) : (
          <>
            {isRegister ? (
              <>
                <UserPlus size={16} />
                Create Account
              </>
            ) : (
              <>
                <LogIn size={16} />
                Login
              </>
            )}
          </>
        )}
      </button>

      <p className="text-center text-sm text-brand-grey dark:text-gray-400">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-yellow-dark hover:underline dark:text-brand-yellow">
              Login
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-brand-yellow-dark hover:underline dark:text-brand-yellow">
              Register
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function IconField({
  icon: Icon,
  label,
  name,
  type = "text",
  placeholder,
  required,
  pattern,
}: {
  icon: typeof Mail;
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-brand-ink dark:text-gray-200">
        {label}
      </label>
      <div className="relative">
        <Icon
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-grey-light"
        />
        <input
          id={name}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          pattern={pattern}
          className="input-base pl-10"
        />
      </div>
    </div>
  );
}
