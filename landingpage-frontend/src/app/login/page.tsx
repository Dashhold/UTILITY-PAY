import { redirect } from "next/navigation";
import { appUrls } from "@/lib/site";

/**
 * /login exists only to forward to the dashboard.
 *
 * The redirect is server-side rather than a client effect: it issues a real HTTP
 * redirect, so it works without JavaScript, does not flash a spinner, and is
 * followed correctly by anything that is not a browser.
 */
export default function LoginRedirectPage() {
  redirect(appUrls.login);
}
