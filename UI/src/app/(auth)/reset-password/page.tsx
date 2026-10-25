import type { Metadata } from "next";
import { AuthFrame } from "../../../features/auth/frame";
import { ResetForm } from "../../../features/auth/reset-form";
export const metadata: Metadata = {
  title: "Yeni parola",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function ResetPage() {
  return (
    <AuthFrame>
      <ResetForm />
    </AuthFrame>
  );
}
