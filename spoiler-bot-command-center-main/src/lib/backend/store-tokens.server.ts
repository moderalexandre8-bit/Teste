import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type StoreTokenTransaction = {
  id: string;
  owner_id: string;
  plan_id: string | null;
  store_plan_name?: string | null;
  store_plan_duration_days?: number | null;
  store_customer_id: string | null;
  delivery_mode: string;
  paid_at: string | null;
};

function encryptionKey() {
  const configured = process.env["ACCESS_TOKEN_ENCRYPTION_KEY"];
  if (!configured || configured.length < 32)
    throw new Error("Configure ACCESS_TOKEN_ENCRYPTION_KEY com pelo menos 32 caracteres.");
  return createHash("sha256").update(configured).digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptAccessToken(ciphertext: string) {
  const payload = Buffer.from(ciphertext, "base64");
  if (payload.length < 29) throw new Error("Token de acesso armazenado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}

export async function issueStoreAccessToken(transaction: StoreTokenTransaction) {
  const database = supabaseAdmin;
  const markDelivered = async () => {
    const { error } = await database
      .from("transactions")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", transaction.id)
      .is("delivered_at", null);
    if (error) throw new Error(`Não foi possível registrar a emissão do token: ${error.message}`);
  };
  const { data: existing, error: existingError } = await database
    .from("store_access_tokens")
    .select("token_ciphertext")
    .eq("transaction_id", transaction.id)
    .maybeSingle();
  if (existingError)
    throw new Error(`Não foi possível consultar o token: ${existingError.message}`);
  if (existing) {
    await markDelivered();
    return;
  }
  if (!transaction.store_customer_id || transaction.delivery_mode !== "store_token")
    throw new Error("A compra da loja não está vinculada a um cliente.");

  let durationDays = transaction.store_plan_duration_days;
  if (!transaction.store_plan_name) {
    if (!transaction.plan_id) throw new Error("A compra não possui um plano válido.");
    const { data: plan, error: planError } = await database
      .from("plans")
      .select("duration_days")
      .eq("id", transaction.plan_id)
      .eq("owner_id", transaction.owner_id)
      .single();
    if (planError || !plan)
      throw new Error(
        `Não foi possível validar o plano: ${planError?.message ?? "não encontrado"}`,
      );
    durationDays = plan.duration_days;
  }

  const rawToken = `TB-${randomBytes(24).toString("hex").toUpperCase()}`;
  const paidAt = transaction.paid_at ?? new Date().toISOString();
  const expiresAt = durationDays
    ? new Date(Date.parse(paidAt) + Number(durationDays) * 86_400_000).toISOString()
    : null;
  const { error: insertError } = await database.from("store_access_tokens").insert({
    transaction_id: transaction.id,
    owner_id: transaction.owner_id,
    customer_id: transaction.store_customer_id,
    plan_id: transaction.plan_id,
    token_hash: createHash("sha256").update(rawToken).digest("hex"),
    token_ciphertext: encryptToken(rawToken),
    expires_at: expiresAt,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      await markDelivered();
      return;
    }
    throw new Error(`Não foi possível emitir o token de acesso: ${insertError.message}`);
  }
  await markDelivered();
}
