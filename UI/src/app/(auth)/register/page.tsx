import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../../../features/auth/auth-form";
import { AuthFrame } from "../../../features/auth/frame";
import { FormSkeleton } from "../../../components/ui/skeleton";

export const metadata: Metadata = {
  title: "Hesap oluştur",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function RegisterPage() {
  return (
    <AuthFrame welcome>
      <Suspense fallback={<FormSkeleton label="Kayıt formu hazırlanıyor…" />}>
        <AuthForm mode="register" />
      </Suspense>
    </AuthFrame>
  );
}
