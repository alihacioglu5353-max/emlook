/** Denetim kaydı eylemlerinin Türkçe karşılıkları ve kategorileri (log izleme ekranı) */
export const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Giriş yaptı",
  "auth.login_failed": "Hatalı giriş denemesi",
  "auth.logout": "Çıkış yaptı",
  "auth.locked": "Hesap geçici kilitlendi",
  "password.set": "Parola belirledi",
  "password.changed": "Parolasını değiştirdi",
  "password.reset_requested": "Parola yenileme istedi",
  "password.reset": "Parolasını yeniledi",
  "session.revoked": "Oturum sonlandırıldı",
  "listing.created": "İlan oluşturdu",
  "listing.published": "İlan yayınladı",
  "listing.status_changed": "İlan durumunu değiştirdi",
  "listing.deleted": "İlan sildi",
  "listing.removed": "İlanı yayından kaldırdı",
  "listing.restored": "İlanı geri aldı",
  "listing.eids_verified": "EİDS doğrulamasını onayladı",
  "listing.eids_failed": "EİDS doğrulamasını reddetti",
  "interest.created": "İlana ilgi gösterdi",
  "payment.paid": "Ödeme alındı",
  "payment_request.created": "Ödeme talebi oluşturdu",
  "payment_request.cancelled": "Ödeme talebini iptal etti",
  "payout_account.updated": "IBAN bilgisini güncelledi",
  "user.onboarded": "Kaydını tamamladı",
  "consent.updated": "İzin tercihini değiştirdi",
  "agent.submitted": "Onay başvurusu gönderdi",
  "agent.approved": "Danışman başvurusunu onayladı",
  "agent.rejected": "Danışman başvurusunu reddetti",
  "office.approved": "Ofisi onayladı",
  "office.rejected": "Ofisi reddetti",
  "user.suspended": "Kullanıcıyı askıya aldı",
  "user.reactivated": "Kullanıcıyı etkinleştirdi",
  "report.dismissed": "Şikâyeti kapattı",
  "settings.updated": "Ayarları değiştirdi",
  "document_type.updated": "Evrak türünü güncelledi",
  "badges.recomputed": "Rozet puanlarını yeniden hesapladı",
};

export type Tone = "ok" | "warn" | "brand" | "neutral" | "ink";
export function actionTone(action: string): Tone {
  if (["auth.login_failed", "auth.locked", "user.suspended", "listing.removed", "agent.rejected", "office.rejected", "session.revoked", "listing.eids_failed"].includes(action)) return "brand";
  if (action.startsWith("password.") || action === "payment_request.cancelled") return "warn";
  if (["auth.login", "listing.published", "payment.paid", "agent.approved", "office.approved", "listing.eids_verified", "user.reactivated"].includes(action)) return "ok";
  if (action.startsWith("settings.") || action.startsWith("document_type.") || action.startsWith("badges.")) return "ink";
  return "neutral";
}

/** Tarayıcı bilgisinden kısa cihaz adı: "iPhone · Safari", "Emlook iOS uygulaması" */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "—";
  if (ua.startsWith("Emlook/")) return /iPhone|iOS/.test(ua) ? "Emlook iOS uygulaması" : "Emlook Android uygulaması";
  if (/python|curl|wget|bot|requests/i.test(ua)) return "Betik / bot";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Bilinmeyen";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı";
  return `${os} · ${br}`;
}
