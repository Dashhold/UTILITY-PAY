import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="container-app flex min-h-[60vh] flex-col items-center justify-center gap-6 py-20 text-center">
      <span className="text-7xl font-extrabold text-brand-yellow">404</span>
      <h1 className="text-2xl font-bold text-brand-ink dark:text-white">
        Page Not Found
      </h1>
      <p className="max-w-md text-brand-grey dark:text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link href="/" className="btn-primary">
        <ArrowLeft size={16} />
        Back to Home
      </Link>
    </div>
  );
}
