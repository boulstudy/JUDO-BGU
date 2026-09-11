// /remote used to be the phone remote; the coach app now lives at "/" itself.
// A PWA installed from the old remote-manifest.json still opens here, so this
// stays as a redirect rather than a 404 — an install a coach already made
// should not break.
import { redirect } from "next/navigation";

export default function RemoteRedirect() {
  redirect("/");
}
