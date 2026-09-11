import CoachApp from "./coach/CoachApp";
import AuthGate from "./coach/AuthGate";

// Clubs are opt-in until supabase/schema.sql has actually been run against
// the project — see CLAUDE.md. With the flag off (the default), the app
// behaves exactly as it did in phase 2: local-first, no sign-in, works the
// moment you open it.
const CLUBS_ON = process.env.NEXT_PUBLIC_ENABLE_CLUBS === "1";

export default function Home() {
  if (!CLUBS_ON) return <CoachApp />;
  return (
    <AuthGate>
      <CoachApp />
    </AuthGate>
  );
}
