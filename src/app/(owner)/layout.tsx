import { OwnerShell } from "@/components/navigation/owner-shell";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OwnerShell>{children}</OwnerShell>;
}
