import { redirect } from "next/navigation";
import { appUrls } from "@/lib/site";

/**
 * /register forwards to the dashboard, which handles sign-up on its login screen.
 *
 * Server-side for the same reasons as /login: a real HTTP redirect rather than a
 * client-side hop through a spinner.
 */
export default function RegisterRedirectPage() {
  redirect(appUrls.register);
}
