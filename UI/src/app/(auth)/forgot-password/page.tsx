import type { Metadata } from "next";
import { AuthFrame } from "../../../features/auth/frame";
import { ForgotForm } from "../../../features/auth/forgot-form";
export const metadata: Metadata = {
  title: "Parolamı unuttum",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function ForgotPage() {
  return (
    <AuthFrame>
      <ForgotForm />
    </AuthFrame>
  );
}
