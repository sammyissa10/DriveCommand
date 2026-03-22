import { Redirect } from 'expo-router'

// Entry point: redirect to login screen.
// Phase 30 will implement auth guard logic (driver vs owner routing).
export default function Index() {
  return <Redirect href="/login" />
}
