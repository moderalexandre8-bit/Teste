import { JWT } from "google-auth-library";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type PixNotification = "pix_generated" | "pix_confirmed";

export type AdminPushInput = {
  title: string;
  body: string;
  icon?: string;
  logoUrl?: string | null;
};

type FirebaseServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let firebaseJwt: JWT | undefined;

function getFirebaseClient() {
  const rawAccount = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!rawAccount) {
    console.warn("[push] FIREBASE_SERVICE_ACCOUNT_JSON is not configured; push was skipped.");
    return null;
  }

  let account: FirebaseServiceAccount;
  try {
    account = JSON.parse(rawAccount) as FirebaseServiceAccount;
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.", {
      cause: error,
    });
  }
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key.",
    );
  }

  firebaseJwt ??= new JWT({
    email: account.client_email,
    key: account.private_key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  return { projectId: account.project_id, auth: firebaseJwt };
}

function messageFor(event: PixNotification, amountCents: number) {
  const amount = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);

  return event === "pix_generated"
    ? { title: "Pix gerado", body: `Uma cobrança de ${amount} foi criada.` }
    : { title: "Venda confirmada", body: `Pagamento de ${amount} confirmado.` };
}

export function buildAdminPushPayload(input: AdminPushInput) {
  const title = input.title.trim();
  const body = input.body.trim();
  const logoUrl =
    input.logoUrl && /^https?:\/\//i.test(input.logoUrl)
      ? input.logoUrl
      : "https://www.tigerbot.app/tigerbot-logo.png";

  return {
    title,
    body,
    image: logoUrl,
    notification: {
      title,
      body,
      image: logoUrl,
    },
    android: {
      priority: "HIGH",
      notification: {
        channelId: "pix-alerts",
        icon: "ic_stat_tigerbot",
        color: "#f59e0b",
        image: logoUrl,
        sound: "default",
      },
    },
    webpush: {
      headers: { Urgency: "high" },
      notification: {
        icon: logoUrl,
        badge: logoUrl,
        image: logoUrl,
      },
    },
    data: {
      event: "admin_notification",
      icon: input.icon ?? "🐯",
    },
  } as const;
}

async function sendToTokens(
  firebase: NonNullable<ReturnType<typeof getFirebaseClient>>,
  tokens: string[],
  notification: { title: string; body: string },
  data: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  const accessTokenResult = await firebase.auth.getAccessToken();
  const accessToken =
    typeof accessTokenResult === "string" ? accessTokenResult : accessTokenResult.token;
  if (!accessToken) throw new Error("Firebase did not provide an OAuth access token.");

  const outcomes = await Promise.allSettled(
    tokens.map(async (token) => {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebase.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification,
              data,
              android: {
                priority: "HIGH",
                notification: {
                  channelId: "pix-alerts",
                  icon: "ic_stat_tigerbot",
                  color: "#f59e0b",
                  sound: "default",
                },
              },
              ...extra,
            },
          }),
        },
      );

      if (response.ok) return true;
      const responseText = await response.text();
      let responseBody: { error?: { status?: string } } = {};
      try {
        responseBody = JSON.parse(responseText) as { error?: { status?: string } };
      } catch {
        responseBody = {};
      }

      if (responseBody.error?.status === "UNREGISTERED") {
        const { error: deleteError } = await supabaseAdmin
          .from("device_push_tokens")
          .delete()
          .eq("token", token);
        if (deleteError)
          throw new Error(`FCM token expired and could not be removed: ${deleteError.message}`);
        return false;
      }
      throw new Error(`Firebase push failed (${response.status}): ${responseText.slice(0, 500)}`);
    }),
  );
  const failures = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
  );
  const sent = outcomes.filter(
    (outcome): outcome is PromiseFulfilledResult<boolean> =>
      outcome.status === "fulfilled" && outcome.value,
  ).length;
  return { sent, failures };
}

export async function sendPixPushNotification(
  userId: string | null,
  transactionId: string,
  amountCents: number,
  event: PixNotification,
) {
  if (!userId) return;
  const firebase = getFirebaseClient();
  if (!firebase) return;

  const { data: devices, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load push devices for this account: ${error.message}`);
  if (!devices?.length) return;

  const { sent, failures } = await sendToTokens(
    firebase,
    devices.map(({ token }) => token),
    messageFor(event, amountCents),
    { event, transactionId },
  );
  if (failures.length) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `Could not send ${failures.length} of ${sent + failures.length} Pix push notification(s).`,
    );
  }
}

export async function sendAdminPushNotification(input: {
  userId: string | null;
  title: string;
  body: string;
  icon: string;
  logoUrl?: string | null;
}) {
  const firebase = getFirebaseClient();
  if (!firebase)
    throw new Error("O envio push não está disponível: configure o Firebase no servidor.");

  const pageSize = 500;
  let lastToken: string | null = null;
  let targeted = 0;
  let sent = 0;
  let failed = 0;

  while (true) {
    let query = supabaseAdmin
      .from("device_push_tokens")
      .select("token")
      .order("token")
      .limit(pageSize);
    if (lastToken) query = query.gt("token", lastToken);
    if (input.userId) query = query.eq("user_id", input.userId);
    const { data: devices, error } = await query;
    if (error) throw new Error(`Não foi possível carregar os dispositivos: ${error.message}`);
    const tokens = (devices ?? []).map(({ token }) => token);
    if (!tokens.length) break;

    const payload = buildAdminPushPayload(input);
    const result = await sendToTokens(
      firebase,
      tokens,
      {
        title: payload.notification.title,
        body: payload.notification.body,
      },
      payload.data,
      {
        android: payload.android,
        webpush: payload.webpush,
      },
    );
    targeted += tokens.length;
    sent += result.sent;
    failed += tokens.length - result.sent;
    lastToken = tokens[tokens.length - 1] ?? null;
    if (tokens.length < pageSize) break;
  }

  return { targeted, sent, failed };
}
