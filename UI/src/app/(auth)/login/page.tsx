import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../../../features/auth/auth-form";
import { AuthFrame } from "../../../features/auth/frame";
import { FormSkeleton } from "../../../components/ui/skeleton";

export const metadata: Metadata = {
  title: "Giriş yap",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function LoginPage() {
  return (
    <AuthFrame welcome>
      <Suspense fallback={<FormSkeleton label="Giriş formu hazırlanıyor…" />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthFrame>
  );
}
