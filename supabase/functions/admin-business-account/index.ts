// =====================================================================
// admin-business-account — İşletme giriş hesaplarını güvenli şekilde yönetir.
//
// Neden Edge Function? Supabase Auth'ta kullanıcı oluşturmak/davet etmek service-role
// anahtarı gerektirir. Bu anahtar ASLA tarayıcıya gönderilmez; yalnızca bu fonksiyonun
// sunucu ortamında (Supabase'in otomatik sağladığı SUPABASE_SERVICE_ROLE_KEY) bulunur.
//
// Her istekte:
//   1. Authorization başlığındaki kullanıcı JWT'si doğrulanır (auth.getUser).
//   2. Kullanıcının profiles.role = 'admin' olduğu service-role ile kontrol edilir.
//   3. İşlem yapılır ve sonucu admin_audit_log tablosuna (varsa) yazılır.
//
// Eylemler (POST JSON { action, ... }):
//   ping                                   → kurulum kontrolü
//   list    { business_id }                → işletmeye bağlı kullanıcılar
//   create  { business_id, email, password, full_name? } → şifreli yeni kullanıcı
//   invite  { business_id, email, full_name? }           → davet e-postası
//   link    { business_id, email }         → mevcut kullanıcıyı bağla
//   unlink  { business_id, user_id }       → bağlantıyı kaldır (kullanıcı silinmez)
//   suspend / unsuspend { business_id, user_id } → girişi askıya al / aç
//
// Şifreler hiçbir yerde saklanmaz veya günlüğe yazılmaz.
// =====================================================================
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://nfcova.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);
const BUSINESS_PANEL_URL = Deno.env.get("BUSINESS_PANEL_URL") ?? "https://nfcova.github.io/baksana-isletme/";

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function requireEmail(v: unknown): string {
  const e = String(v ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, "Geçerli bir e-posta girin.");
  return e;
}
function requireId(v: unknown, label: string): string {
  const s = String(v ?? "").trim();
  if (!s) throw new HttpError(400, `${label} gerekli.`);
  return s;
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  // Auth Admin API'de doğrudan e-posta araması yok; sayfalı tarama (küçük kullanıcı sayıları için yeterli)
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, "Kullanıcılar listelenemedi: " + error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function getBusiness(admin: SupabaseClient, id: string) {
  const { data, error } = await admin.from("businesses").select("id,name,active").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "İşletme okunamadı: " + error.message);
  if (!data) throw new HttpError(404, "İşletme bulunamadı.");
  return data;
}

async function getProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from("profiles").select("id,role,business_id,full_name").eq("id", userId).maybeSingle();
  if (error) throw new HttpError(500, "Profil okunamadı: " + error.message);
  return data as { id: string; role: string | null; business_id: string | number | null; full_name: string | null } | null;
}

/* Profil kaydı: yoksa oluşturur, varsa yalnızca rol / işletme / ad alanlarını günceller */
async function attachProfile(admin: SupabaseClient, userId: string, businessId: string, fullName: string | null) {
  const existing = await getProfile(admin, userId);
  const patch: Record<string, unknown> = { role: "business", business_id: businessId };
  if (fullName) patch.full_name = fullName;
  const q = existing
    ? admin.from("profiles").update(patch).eq("id", userId).select("id")
    : admin.from("profiles").insert({ id: userId, ...patch }).select("id");
  const { data, error } = await q;
  if (error || !data?.length) throw new HttpError(500, "Profil bağlanamadı: " + (error?.message ?? "satır dönmedi"));
}

/* Kullanıcının hedef işletmeye bağlanabilir olduğunu doğrular */
function assertLinkable(p: Awaited<ReturnType<typeof getProfile>>, businessId: string) {
  if (!p) return;
  if (p.role === "admin") throw new HttpError(409, "Bu kullanıcı yönetici; işletmeye bağlanamaz.");
  if (p.business_id != null && String(p.business_id) !== businessId) {
    throw new HttpError(409, "Bu kullanıcı başka bir işletmeye bağlı. Önce o işletmeden bağlantısını kaldırın.");
  }
}

async function assertBelongs(admin: SupabaseClient, userId: string, businessId: string) {
  const p = await getProfile(admin, userId);
  if (!p || String(p.business_id) !== businessId) throw new HttpError(404, "Kullanıcı bu işletmeye bağlı değil.");
  return p;
}

async function audit(admin: SupabaseClient, actor: User, action: string, businessId: string, details: Record<string, unknown>) {
  // admin_audit_log (sql/03) yoksa sessizce atlanır; hata ana işlemi etkilemez
  try {
    await admin.from("admin_audit_log").insert({
      actor_id: actor.id, actor_email: actor.email, actor_role: "admin",
      action: "UPDATE", table_name: "auth_account", record_id: String(details.user_id ?? ""),
      business_id: businessId, new_data: { account_action: action, ...details },
    });
  } catch (_) { /* yok say */ }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Yalnızca POST." });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1) Çağıranı doğrula
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Oturum bulunamadı.");
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) throw new HttpError(401, "Oturum doğrulanamadı.");
    const caller = auth.user;

    // 2) Admin yetkisi (sunucu tarafında)
    const callerProfile = await getProfile(admin, caller.id);
    if (callerProfile?.role !== "admin") throw new HttpError(403, "Bu işlem yalnızca yöneticiler içindir.");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "ping") return reply(200, { ok: true });

    const businessId = requireId(body.business_id, "business_id");
    await getBusiness(admin, businessId);

    if (action === "list") {
      const { data: profs, error } = await admin.from("profiles").select("id,full_name,role")
        .eq("business_id", businessId);
      if (error) throw new HttpError(500, "Profiller okunamadı: " + error.message);
      const users = [];
      for (const p of profs ?? []) {
        // Tek bir kullanıcının okunamaması tüm listeyi düşürmesin
        const u = await admin.auth.admin.getUserById(p.id).then((r) => r.data?.user, () => null);
        users.push({
          id: p.id, full_name: p.full_name, role: p.role,
          email: u?.email ?? null,
          last_sign_in_at: u?.last_sign_in_at ?? null,
          invited: !!u?.invited_at && !u?.last_sign_in_at,
          banned: !!u?.banned_until && new Date(u.banned_until) > new Date(),
        });
      }
      return reply(200, { ok: true, users });
    }

    if (action === "create" || action === "invite") {
      const email = requireEmail(body.email);
      const fullName = body.full_name ? String(body.full_name).slice(0, 120) : null;
      if (await findUserByEmail(admin, email)) {
        throw new HttpError(409, "Bu e-posta ile kayıtlı bir kullanıcı zaten var. “Mevcut kullanıcıyı bağla” seçeneğini kullanın.");
      }
      let user: User | null = null;
      if (action === "create") {
        const password = String(body.password ?? "");
        if (password.length < 10) throw new HttpError(400, "Şifre en az 10 karakter olmalı.");
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: fullName ? { full_name: fullName } : {},
        });
        if (error || !data.user) throw new HttpError(400, "Kullanıcı oluşturulamadı: " + (error?.message ?? ""));
        user = data.user;
      } else {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: BUSINESS_PANEL_URL, data: fullName ? { full_name: fullName } : {},
        });
        if (error || !data.user) throw new HttpError(400, "Davet gönderilemedi: " + (error?.message ?? ""));
        user = data.user;
      }
      try {
        await attachProfile(admin, user.id, businessId, fullName);
      } catch (e) {
        // Yarım kalan hesabı geri al: profil bağlanamadıysa yeni kullanıcıyı sil
        await admin.auth.admin.deleteUser(user.id).catch(() => {});
        throw e;
      }
      await audit(admin, caller, action, businessId, { user_id: user.id, email });
      return reply(200, { ok: true, user_id: user.id });
    }

    if (action === "link") {
      const email = requireEmail(body.email);
      const user = await findUserByEmail(admin, email);
      if (!user) throw new HttpError(404, "Bu e-postayla kayıtlı kullanıcı bulunamadı. “Yeni hesap” seçeneğini kullanın.");
      const p = await getProfile(admin, user.id);
      assertLinkable(p, businessId);
      if (p && String(p.business_id) === businessId && p.role === "business") {
        return reply(200, { ok: true, user_id: user.id, message: "Kullanıcı zaten bu işletmeye bağlı." });
      }
      await attachProfile(admin, user.id, businessId, null);
      await audit(admin, caller, "link", businessId, { user_id: user.id, email });
      return reply(200, { ok: true, user_id: user.id });
    }

    if (action === "unlink") {
      const userId = requireId(body.user_id, "user_id");
      await assertBelongs(admin, userId, businessId);
      // Kullanıcı silinmez; işletme bağlantısı kaldırılır (işletme paneli business_id olmadan girişe izin vermez)
      const { data, error } = await admin.from("profiles").update({ business_id: null }).eq("id", userId).select("id");
      if (error || !data?.length) throw new HttpError(500, "Bağlantı kaldırılamadı: " + (error?.message ?? ""));
      await audit(admin, caller, "unlink", businessId, { user_id: userId });
      return reply(200, { ok: true });
    }

    if (action === "suspend" || action === "unsuspend") {
      const userId = requireId(body.user_id, "user_id");
      await assertBelongs(admin, userId, businessId);
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: action === "suspend" ? "876000h" : "none" });
      if (error) throw new HttpError(500, "Hesap güncellenemedi: " + error.message);
      await audit(admin, caller, action, businessId, { user_id: userId });
      return reply(200, { ok: true });
    }

    throw new HttpError(400, "Bilinmeyen işlem.");
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Beklenmeyen hata";
    if (status >= 500) console.error("admin-business-account:", e);
    return reply(status, { ok: false, error: message });
  }
});
