import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  Bot,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Globe2,
  KeyRound,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminSiteSettings } from "@/components/admin/site-settings";
import { PageHeader, Stat, StatusBadge, fmtDate } from "@/components/admin/ui-bits";
import { brl } from "@/lib/providers-meta";
import { PLAN_BUTTON_STYLES } from "@/lib/bot-offer";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAccess,
  adminOverview,
  adminListUsers,
  adminUserDetails,
  adminUpdateBot,
  adminRenameLead,
  adminResetBotStarts,
  adminClearAllActivity,
  adminSetGatewayOverride,
  adminRestoreGatewayCredentials,
  adminMaintenanceSettings,
  adminSetMaintenance,
  adminSetFanvueAccess,
  adminDeleteUser,
  adminSendNotification,
  type AdminBotEdit,
  type AdminLeadEdit,
  type GatewayOverrideInput,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração — TigerBot" }] }),
  beforeLoad: async () => {
    if (!(await adminAccess())) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

type AdminUser = {
  id: string;
  email: string;
  confirmed: boolean;
  fanvueAllowed: boolean;
  created_at: string;
  profile: { display_name: string | null; username: string | null } | null;
};

function formatTransactionAmount(transaction: {
  amount_cents: number;
  payment_currency?: string | null;
  provider_amount_minor?: number | null;
}) {
  if (
    (transaction.payment_currency === "USD" || transaction.payment_currency === "EUR") &&
    transaction.provider_amount_minor != null
  )
    return (transaction.provider_amount_minor / 100).toLocaleString(
      transaction.payment_currency === "USD" ? "en-US" : "pt-BR",
      {
        style: "currency",
        currency: transaction.payment_currency,
      },
    );
  return brl(transaction.amount_cents);
}

type AdminBotDraft = Omit<AdminBotEdit, "botId"> & { botId: string; username: string };
const adminNotificationIcons = [
  { value: "🐯", label: "Tigre" },
  { value: "🔔", label: "Sino" },
  { value: "🎉", label: "Celebração" },
  { value: "💎", label: "Diamante" },
  { value: "⚡", label: "Energia" },
  { value: "📢", label: "Aviso" },
  { value: "✅", label: "Confirmação" },
  { value: "🔥", label: "Fogo" },
] as const;
type AdminNotificationIcon = (typeof adminNotificationIcons)[number]["value"];
type CommunityGroup = {
  id: string;
  platform: "whatsapp" | "telegram";
  name: string;
  description: string | null;
  logo_url: string | null;
  url: string;
  position: number;
  active: boolean;
};
type CommunityGroupDraft = Omit<CommunityGroup, "id"> & { id?: string };
const adminSections = [
  { id: "overview", label: "Visão geral", icon: Activity },
  { id: "site", label: "Acesso e app", icon: Smartphone },
  { id: "accounts", label: "Contas", icon: Users },
  { id: "community", label: "Comunidade", icon: MessageCircle },
  { id: "notifications", label: "Notificações", icon: Bell },
] as const;
type AdminSection = (typeof adminSections)[number]["id"];

function AdminPage() {
  const { user: adminUser } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const accessFn = useServerFn(adminAccess);
  const overviewFn = useServerFn(adminOverview);
  const listUsersFn = useServerFn(adminListUsers);
  const detailsFn = useServerFn(adminUserDetails);
  const updateBotFn = useServerFn(adminUpdateBot);
  const renameLeadFn = useServerFn(adminRenameLead);
  const resetStartsFn = useServerFn(adminResetBotStarts);
  const clearAllActivityFn = useServerFn(adminClearAllActivity);
  const overrideFn = useServerFn(adminSetGatewayOverride);
  const restoreFn = useServerFn(adminRestoreGatewayCredentials);
  const maintenanceSettingsFn = useServerFn(adminMaintenanceSettings);
  const setMaintenanceFn = useServerFn(adminSetMaintenance);
  const setFanvueAccessFn = useServerFn(adminSetFanvueAccess);
  const deleteUserFn = useServerFn(adminDeleteUser);
  const sendNotificationFn = useServerFn(adminSendNotification);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editingBot, setEditingBot] = useState<AdminBotDraft | null>(null);
  const [communityDraft, setCommunityDraft] = useState<CommunityGroupDraft | null>(null);
  const [savingCommunity, setSavingCommunity] = useState(false);
  const [deletingCommunityId, setDeletingCommunityId] = useState<string | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [notificationTarget, setNotificationTarget] = useState<"all" | "selected">("all");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [notificationIcon, setNotificationIcon] = useState<AdminNotificationIcon>("🐯");
  const [notificationLogoUrl, setNotificationLogoUrl] = useState(() =>
    typeof window !== "undefined"
      ? `${window.location.origin}/tigerbot-logo.png`
      : "/tigerbot-logo.png",
  );
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  const access = useQuery({ queryKey: ["admin-access"], queryFn: () => accessFn() });
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => overviewFn(),
    enabled: access.data === true,
  });
  const maintenance = useQuery({
    queryKey: ["admin-maintenance"],
    queryFn: () => maintenanceSettingsFn(),
    enabled: access.data === true,
  });
  useEffect(() => {
    if (maintenance.data) setMaintenanceMessage(maintenance.data.maintenance_message);
  }, [maintenance.data]);
  const userList = useQuery({
    queryKey: ["admin-users", userPage, submittedQuery],
    queryFn: () =>
      listUsersFn({
        data: { query: submittedQuery || undefined, page: userPage, pageSize: 25 },
      }),
    enabled: access.data === true,
  });
  const details = useQuery({
    queryKey: ["admin-user", selectedUser?.id],
    queryFn: () => detailsFn({ data: { userId: selectedUser!.id } }),
    enabled: access.data === true && Boolean(selectedUser),
  });
  const refreshDetails = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-user", selectedUser?.id] });
    void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  const updateBot = useMutation({
    mutationFn: (data: AdminBotEdit) => updateBotFn({ data }),
    onSuccess: () => {
      toast.success("Bot atualizado.");
      setEditingBot(null);
      refreshDetails();
    },
    onError: (error) => toast.error(error.message),
  });
  const renameLead = useMutation({
    mutationFn: (data: AdminLeadEdit) => renameLeadFn({ data }),
    onSuccess: () => {
      toast.success("Nome atualizado.");
      refreshDetails();
    },
    onError: (error) => toast.error(error.message),
  });
  const resetStarts = useMutation({
    mutationFn: (botId: string) => resetStartsFn({ data: { botId } }),
    onSuccess: (result) => {
      toast.success(`${result.deleted} starts removidos.`);
      refreshDetails();
    },
    onError: (error) => toast.error(error.message),
  });
  const clearAllActivity = useMutation({
    mutationFn: () => clearAllActivityFn({ data: { confirmed: true } }),
    onSuccess: (result) => {
      toast.success(
        `${result.deletedStarts} starts removidos. Atividade e pendências antigas foram ocultadas sem cancelar pedidos.`,
      );
      refreshDetails();
      void queryClient.invalidateQueries({ queryKey: ["admin-user"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const setOverride = useMutation({
    mutationFn: (data: GatewayOverrideInput) => overrideFn({ data }),
    onSuccess: () => {
      toast.success("API substituta aplicada. A chave original foi preservada.");
      refreshDetails();
    },
    onError: (error) => toast.error(error.message),
  });
  const restore = useMutation({
    mutationFn: (gatewayId: string) => restoreFn({ data: { gatewayId } }),
    onSuccess: () => {
      toast.success("Credenciais originais do usuário restauradas.");
      refreshDetails();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMaintenance = useMutation({
    mutationFn: (enabled: boolean) =>
      setMaintenanceFn({
        data: {
          enabled,
          message:
            maintenanceMessage.trim() ||
            "Estamos realizando uma manutenção para melhorar o TigerBot. Voltaremos em breve.",
        },
      }),
    onSuccess: async (settings) => {
      setMaintenanceMessage(settings.maintenance_message);
      await queryClient.invalidateQueries({ queryKey: ["admin-maintenance"] });
      toast.success(
        settings.maintenance_enabled
          ? "Manutenção global ativada."
          : "Manutenção global desativada.",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const setFanvueAccess = useMutation({
    mutationFn: (data: { userId: string; allowed: boolean }) => setFanvueAccessFn({ data }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(
        variables.allowed
          ? "Conta liberada para conectar a Fanvue."
          : "Acesso Fanvue removido para esta conta.",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteUser = useMutation({
    mutationFn: (userId: string) => deleteUserFn({ data: { userId } }),
    onSuccess: async (_result, userId) => {
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
        setEditingBot(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
      ]);
      toast.success("Conta excluída permanentemente.");
    },
    onError: async (error) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
      ]);
      toast.error(error.message);
    },
  });
  const sendNotification = useMutation({
    mutationFn: () =>
      sendNotificationFn({
        data: {
          userId: notificationTarget === "selected" ? (selectedUser?.id ?? null) : null,
          title: notificationTitle,
          body: notificationBody,
          icon: notificationIcon,
          logoUrl: notificationLogoUrl.trim() || null,
        },
      }),
    onSuccess: (result) => {
      if (result.failed) {
        toast.error(
          `Enviadas para ${result.sent} dispositivo(s); ${result.failed} falharam ou estão inválidos.`,
        );
      } else {
        toast.success(
          result.targeted
            ? `Notificação enviada para ${result.sent} dispositivo(s).`
            : "Nenhum dispositivo registrado para este destinatário.",
        );
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const communityGroups = useQuery({
    queryKey: ["admin-community-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_groups")
        .select("id, platform, name, description, logo_url, url, position, active")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: access.data === true,
  });

  async function saveCommunityGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!communityDraft) return;
    const name = communityDraft.name.trim();
    const url = communityDraft.url.trim();
    try {
      const parsedUrl = new URL(url);
      if (!name || parsedUrl.protocol !== "https:") {
        toast.error("Informe o nome e um link HTTPS válido.");
        return;
      }
      const logoUrl = communityDraft.logo_url?.trim();
      if (logoUrl && new URL(logoUrl).protocol !== "https:") {
        toast.error("A logo deve usar um endereço HTTPS válido.");
        return;
      }
    } catch {
      toast.error("Informe um link HTTPS válido para o grupo e para a logo.");
      return;
    }

    setSavingCommunity(true);
    try {
      const payload = {
        platform: communityDraft.platform,
        name,
        description: (communityDraft.description ?? "").trim() || null,
        logo_url: communityDraft.logo_url?.trim() || null,
        url,
        position: Math.max(0, Math.trunc(Number(communityDraft.position) || 0)),
        active: communityDraft.active,
        updated_at: new Date().toISOString(),
      };
      const result = communityDraft.id
        ? await supabase.from("community_groups").update(payload).eq("id", communityDraft.id)
        : await supabase.from("community_groups").insert(payload);
      if (result.error) throw result.error;
      toast.success("Grupo da comunidade salvo.");
      setCommunityDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-community-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["community-groups"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o grupo.");
    } finally {
      setSavingCommunity(false);
    }
  }

  async function deleteCommunityGroup(group: CommunityGroup) {
    if (!window.confirm(`Excluir o grupo "${group.name}"?`)) return;
    setDeletingCommunityId(group.id);
    try {
      const { error } = await supabase.from("community_groups").delete().eq("id", group.id);
      if (error) throw error;
      toast.success("Grupo removido.");
      await queryClient.invalidateQueries({ queryKey: ["admin-community-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["community-groups"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o grupo.");
    } finally {
      setDeletingCommunityId(null);
    }
  }

  if (access.isLoading)
    return <p className="text-sm text-muted-foreground">Verificando acesso administrativo…</p>;
  if (access.error || !access.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {access.error?.message ?? "Acesso administrativo indisponível."}
      </p>
    );
  }

  const selectedDetails = details.data;

  return (
    <div className="flex min-h-full flex-col gap-3">
      <PageHeader
        compact
        title="Painel administrativo"
        desc="Operação global e suporte às contas."
        actions={
          <Button
            variant="destructive"
            size="sm"
            disabled={clearAllActivity.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Zerar os starts e a atividade recente de TODOS os usuários? Pedidos pendentes e vendas serão preservados no banco; apenas sairão da tela. Nenhum Pix será cancelado.",
                )
              )
                clearAllActivity.mutate();
            }}
          >
            <Trash2 className="size-4" />
            {clearAllActivity.isPending ? "Limpando…" : "Zerar atividade global"}
          </Button>
        }
      />

      <nav
        aria-label="Seções administrativas"
        className="grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.025] p-1 sm:grid-cols-3 xl:grid-cols-5"
      >
        {adminSections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeSection === id}
            onClick={() => setActiveSection(id)}
            className={`flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors ${
              activeSection === id
                ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>

      <div className="pr-1 pb-2">
        {activeSection === "overview" && (
          <div className="space-y-3 pb-2">
            <section className="space-y-4 rounded-2xl border border-primary/20 bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldAlert className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold">Manutenção global</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bloqueia o acesso ao site para todos, exceto administradores. Checkout,
                    pagamentos e webhooks continuam ativos.
                  </p>
                </div>
              </div>
              {maintenance.error && (
                <p role="alert" className="text-sm text-destructive">
                  {maintenance.error.message}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label htmlFor="maintenance-message">Mensagem exibida durante a manutenção</Label>
                  <Textarea
                    id="maintenance-message"
                    className="mt-1 min-h-20"
                    maxLength={300}
                    value={maintenanceMessage}
                    onChange={(event) => setMaintenanceMessage(event.target.value)}
                    placeholder="Estamos realizando uma manutenção. Voltaremos em breve."
                  />
                </div>
                <Button
                  type="button"
                  variant={maintenance.data?.maintenance_enabled ? "destructive" : "default"}
                  disabled={!maintenance.data || updateMaintenance.isPending}
                  onClick={() => updateMaintenance.mutate(!maintenance.data?.maintenance_enabled)}
                >
                  <ShieldAlert className="size-4" />
                  {updateMaintenance.isPending
                    ? "Salvando…"
                    : maintenance.data?.maintenance_enabled
                      ? "Desativar manutenção"
                      : "Ativar manutenção"}
                </Button>
              </div>
              {maintenance.data?.maintenance_enabled && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  O site está em manutenção. Você continua com acesso administrativo para
                  desativá-la.
                </p>
              )}
            </section>

            {overview.error && (
              <p role="alert" className="text-sm text-destructive">
                {overview.error.message}
              </p>
            )}
            {overview.data && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <Stat
                  label="Contas"
                  value={overview.data.userCount}
                  hint={<Users className="inline size-3" />}
                />
                <Stat
                  label="Bots"
                  value={overview.data.botCount}
                  hint={<Bot className="inline size-3" />}
                />
                <Stat
                  label="Vendas pagas"
                  value={overview.data.paidCount}
                  hint={
                    <>
                      {brl(overview.data.paidAmountCents)}
                      {overview.data.internationalPaidAmountMinor > 0 &&
                        ` · Internacional ${overview.data.internationalPaidAmountMinor.toLocaleString("en-US", { style: "currency", currency: "USD" })}`}
                    </>
                  }
                  accent
                />
                <Stat
                  label="Starts registrados"
                  value={overview.data.startCount}
                  hint={<Activity className="inline size-3" />}
                />
                <Stat
                  label="NXGate online"
                  value={overview.data.activeNxGateCount}
                  hint={<CreditCard className="inline size-3" />}
                />
              </div>
            )}
          </div>
        )}

        {activeSection === "site" && <AdminSiteSettings />}

        {activeSection === "community" && (
          <section className="animate-rise space-y-4 rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Grupos da comunidade</h2>
                <p className="text-sm text-muted-foreground">
                  Cadastre links oficiais de WhatsApp e Telegram para exibir na aba Comunidade.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setCommunityDraft({
                    platform: "whatsapp",
                    name: "",
                    description: "",
                    logo_url: null,
                    url: "",
                    position: communityGroups.data?.length ?? 0,
                    active: true,
                  })
                }
              >
                <Plus className="size-4" /> Adicionar grupo
              </Button>
            </div>
            {communityGroups.error && (
              <p role="alert" className="text-sm text-destructive">
                {communityGroups.error.message}
              </p>
            )}
            {communityDraft && (
              <form
                onSubmit={saveCommunityGroup}
                className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
              >
                <div>
                  <Label htmlFor="community-platform">Plataforma</Label>
                  <select
                    id="community-platform"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={communityDraft.platform}
                    onChange={(event) =>
                      setCommunityDraft({
                        ...communityDraft,
                        platform: event.target.value as CommunityGroup["platform"],
                      })
                    }
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telegram">Telegram</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="community-name">Nome do grupo</Label>
                  <Input
                    id="community-name"
                    required
                    maxLength={100}
                    value={communityDraft.name}
                    onChange={(event) =>
                      setCommunityDraft({ ...communityDraft, name: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="community-url">Link HTTPS</Label>
                  <Input
                    id="community-url"
                    type="url"
                    required
                    placeholder="https://chat.whatsapp.com/... ou https://t.me/..."
                    value={communityDraft.url}
                    onChange={(event) =>
                      setCommunityDraft({ ...communityDraft, url: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="community-logo-url">Logo do grupo (URL HTTPS)</Label>
                  <Input
                    id="community-logo-url"
                    type="url"
                    placeholder="https://.../logo.png"
                    value={communityDraft.logo_url ?? ""}
                    onChange={(event) =>
                      setCommunityDraft({ ...communityDraft, logo_url: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="community-description">Descrição (opcional)</Label>
                  <Textarea
                    id="community-description"
                    maxLength={500}
                    value={communityDraft.description ?? ""}
                    onChange={(event) =>
                      setCommunityDraft({ ...communityDraft, description: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="community-position">Posição</Label>
                  <Input
                    id="community-position"
                    type="number"
                    min={0}
                    value={communityDraft.position}
                    onChange={(event) =>
                      setCommunityDraft({
                        ...communityDraft,
                        position: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={communityDraft.active}
                    onChange={(event) =>
                      setCommunityDraft({ ...communityDraft, active: event.target.checked })
                    }
                  />
                  Exibir na comunidade
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={savingCommunity}>
                    {savingCommunity ? "Salvando…" : "Salvar grupo"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingCommunity}
                    onClick={() => setCommunityDraft(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
            {communityGroups.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando grupos…</p>
            )}
            {communityGroups.data?.length === 0 && !communityDraft && (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum grupo cadastrado ainda.
              </p>
            )}
            <div className="divide-y">
              {communityGroups.data?.map((group) => {
                const Icon = group.platform === "whatsapp" ? MessageCircle : Send;
                return (
                  <div
                    key={group.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {group.logo_url ? (
                        <img
                          src={group.logo_url}
                          alt={`Logo de ${group.name}`}
                          className="size-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <Icon className="size-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {group.name}{" "}
                          {!group.active && <span className="text-muted-foreground">(oculto)</span>}
                        </p>
                        <a
                          href={group.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                        >
                          {group.platform === "whatsapp" ? "WhatsApp" : "Telegram"} · {group.url}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCommunityDraft({ ...group })}
                      >
                        <Pencil className="size-4" /> Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={deletingCommunityId === group.id}
                        onClick={() => void deleteCommunityGroup(group)}
                      >
                        <Trash2 className="size-4" /> Excluir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeSection === "accounts" && (
          <>
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <Search className="size-4" /> Contas cadastradas
              </h2>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSubmittedQuery(query.trim());
                  setUserPage(1);
                }}
              >
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filtrar por e-mail, nome, username ou UUID"
                />
                <Button type="submit" disabled={userList.isFetching}>
                  <Search className="size-4" /> Buscar
                </Button>
              </form>
              {userList.error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {userList.error.message}
                </p>
              )}
              {userList.isLoading && (
                <p className="mt-3 text-sm text-muted-foreground">Carregando contas…</p>
              )}
              {userList.data && (
                <>
                  <div className="mt-4 divide-y">
                    {userList.data.users.length === 0 && (
                      <p className="py-3 text-sm text-muted-foreground">
                        Nenhuma conta encontrada.
                      </p>
                    )}
                    {userList.data.users.map((user) => (
                      <div
                        key={user.id}
                        className={`flex flex-wrap items-center justify-between gap-3 py-3 ${selectedUser?.id === user.id ? "text-primary" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{user.email || user.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.profile?.display_name ?? "Sem nome"} ·{" "}
                            {user.profile?.username ? `@${user.profile.username}` : "sem username"}{" "}
                            · {user.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {user.confirmed ? "E-mail confirmado" : "E-mail pendente"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={user.fanvueAllowed ? "secondary" : "outline"}
                            disabled={setFanvueAccess.isPending}
                            onClick={() =>
                              setFanvueAccess.mutate({
                                userId: user.id,
                                allowed: !user.fanvueAllowed,
                              })
                            }
                          >
                            <Globe2 className="size-4" />
                            {user.fanvueAllowed ? "Fanvue liberada" : "Liberar Fanvue"}
                          </Button>
                          <Button
                            size="sm"
                            variant={selectedUser?.id === user.id ? "default" : "outline"}
                            onClick={() => {
                              setSelectedUser(user);
                              setEditingBot(null);
                            }}
                          >
                            Gerenciar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={user.id === adminUser.id || deleteUser.isPending}
                            title={
                              user.id === adminUser.id
                                ? "Não é possível excluir sua própria conta"
                                : "Excluir conta"
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Excluir permanentemente a conta ${user.email || user.id}? Todos os dados associados serão removidos. Esta ação não pode ser desfeita.`,
                                )
                              )
                                deleteUser.mutate(user.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                            Excluir conta
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                      {userList.data.totalCount.toLocaleString("pt-BR")} contas · página {userPage}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={userPage <= 1 || userList.isFetching}
                        onClick={() => setUserPage((page) => page - 1)}
                      >
                        <ChevronLeft className="size-4" /> Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={userPage * 25 >= userList.data.totalCount || userList.isFetching}
                        onClick={() => setUserPage((page) => page + 1)}
                      >
                        Próxima <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {activeSection === "notifications" && (
          <section className="space-y-4 rounded-2xl border border-primary/20 bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bell className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Enviar notificação</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Envia uma notificação push para os dispositivos registrados, mesmo que a conta do
                  usuário esteja suspensa. O emoji escolhido aparece no título; o ícone nativo do
                  app continua sendo o TigerBot.
                </p>
              </div>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (notificationTarget === "selected" && !selectedUser) {
                  toast.error("Selecione uma conta na lista acima.");
                  return;
                }
                if (
                  notificationTarget === "all" &&
                  !window.confirm("Enviar esta notificação para todos os dispositivos registrados?")
                )
                  return;
                sendNotification.mutate();
              }}
            >
              <div className="sm:col-span-2">
                <Label htmlFor="notification-target">Destinatário</Label>
                <select
                  id="notification-target"
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={notificationTarget}
                  onChange={(event) =>
                    setNotificationTarget(event.target.value === "selected" ? "selected" : "all")
                  }
                >
                  <option value="all">Todos os usuários com dispositivo registrado</option>
                  <option value="selected" disabled={!selectedUser}>
                    {selectedUser
                      ? `Conta selecionada: ${selectedUser.email || selectedUser.id}`
                      : "Conta selecionada — escolha uma conta na lista acima"}
                  </option>
                </select>
              </div>
              <div>
                <Label htmlFor="notification-icon">Ícone da notificação</Label>
                <select
                  id="notification-icon"
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={notificationIcon}
                  onChange={(event) => {
                    const icon = adminNotificationIcons.find(
                      (option) => option.value === event.target.value,
                    );
                    if (icon) setNotificationIcon(icon.value);
                  }}
                >
                  {adminNotificationIcons.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {value} {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="notification-title">Título</Label>
                <Input
                  id="notification-title"
                  required
                  maxLength={100}
                  value={notificationTitle}
                  onChange={(event) => setNotificationTitle(event.target.value)}
                  placeholder="Título da notificação"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notification-logo">Logo da notificação</Label>
                <Input
                  id="notification-logo"
                  type="url"
                  value={notificationLogoUrl}
                  onChange={(event) => setNotificationLogoUrl(event.target.value)}
                  placeholder="https://seusite.com/tigerbot-logo.png"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notification-body">Mensagem</Label>
                <Textarea
                  id="notification-body"
                  required
                  maxLength={500}
                  className="mt-1 min-h-24"
                  value={notificationBody}
                  onChange={(event) => setNotificationBody(event.target.value)}
                  placeholder="Escreva a mensagem que será exibida no aplicativo."
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                {notificationTarget === "selected" && selectedUser && (
                  <p className="text-xs text-muted-foreground">
                    Destinatário: {selectedUser.email || selectedUser.id}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={
                    sendNotification.isPending ||
                    (notificationTarget === "selected" && !selectedUser)
                  }
                >
                  <Bell className="size-4" />
                  {sendNotification.isPending ? "Enviando…" : "Enviar notificação"}
                </Button>
              </div>
            </form>
          </section>
        )}

        {activeSection === "accounts" && selectedUser && (
          <section className="space-y-5 rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="size-4" /> Conta selecionada
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedUser.email} · criada em {fmtDate(selectedUser.created_at)}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedUser(null);
                  setEditingBot(null);
                }}
              >
                Fechar
              </Button>
            </div>
            {details.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando dados da conta…</p>
            )}
            {details.error && (
              <p role="alert" className="text-sm text-destructive">
                {details.error.message}
              </p>
            )}

            {selectedDetails && (
              <>
                <div>
                  <h3 className="mb-2 font-semibold">Bots</h3>
                  <div className="space-y-2">
                    {selectedDetails.bots.map((bot) => (
                      <div
                        key={bot.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
                      >
                        <div>
                          <p className="font-medium">
                            {bot.name} <StatusBadge status={bot.active ? "active" : "paused"} />
                          </p>
                          <p className="text-xs text-muted-foreground">
                            @{bot.username} · {bot.id}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEditingBot({
                                botId: bot.id,
                                username: bot.username,
                                name: bot.name,
                                welcome_text: bot.welcome_text,
                                start_help_text: bot.start_help_text,
                                cta_text: bot.cta_text,
                                after_payment_text: bot.after_payment_text,
                                access_button_text: bot.access_button_text,
                                featured_button_text: bot.featured_button_text,
                                offer_button_style:
                                  bot.offer_button_style === "success" ||
                                  bot.offer_button_style === "danger"
                                    ? bot.offer_button_style
                                    : "primary",
                                featured_button_style:
                                  bot.featured_button_style === "success" ||
                                  bot.featured_button_style === "danger"
                                    ? bot.featured_button_style
                                    : "primary",
                                offer_template:
                                  bot.offer_template as AdminBotEdit["offer_template"],
                                group_photos: bot.group_photos,
                                group_videos: bot.group_videos,
                                notify_chat_id: bot.notify_chat_id,
                                media_chat_id: bot.media_chat_id,
                                telegramToken: "",
                              })
                            }
                          >
                            Editar bot
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Zerar os starts e a atividade recente do bot ${bot.name}? Leads e pedidos serão preservados; apenas os eventos de início serão apagados e a atividade antiga sairá da tela.`,
                                )
                              )
                                resetStarts.mutate(bot.id);
                            }}
                          >
                            Zerar starts e atividade
                          </Button>
                        </div>
                      </div>
                    ))}
                    {selectedDetails.bots.length === 0 && (
                      <p className="text-sm text-muted-foreground">Esta conta não tem bots.</p>
                    )}
                  </div>
                </div>

                {editingBot && (
                  <form
                    className="grid gap-3 rounded-xl border bg-muted/30 p-4 md:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const { username, telegramToken, ...botData } = editingBot;
                      updateBot.mutate({
                        ...botData,
                        ...(telegramToken?.trim() ? { telegramToken: telegramToken.trim() } : {}),
                      });
                    }}
                  >
                    <h3 className="font-semibold md:col-span-2">Editando {editingBot.username}</h3>
                    <div>
                      <Label>Nome do bot</Label>
                      <Input
                        maxLength={64}
                        value={editingBot.name}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, name: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Texto do botão Liberar acesso</Label>
                      <Input
                        value={editingBot.access_button_text}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, access_button_text: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Cor do botão Liberar acesso</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={editingBot.offer_button_style}
                        onChange={(event) =>
                          setEditingBot({
                            ...editingBot,
                            offer_button_style: event.target
                              .value as AdminBotEdit["offer_button_style"],
                          })
                        }
                      >
                        {PLAN_BUTTON_STYLES.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Texto do botão em destaque</Label>
                      <Input
                        maxLength={64}
                        value={editingBot.featured_button_text}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, featured_button_text: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Cor do botão em destaque</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={editingBot.featured_button_style}
                        onChange={(event) =>
                          setEditingBot({
                            ...editingBot,
                            featured_button_style: event.target
                              .value as AdminBotEdit["featured_button_style"],
                          })
                        }
                      >
                        {PLAN_BUTTON_STYLES.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Chamada</Label>
                      <Input
                        value={editingBot.cta_text}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, cta_text: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Modelo da oferta</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={editingBot.offer_template}
                        onChange={(event) =>
                          setEditingBot({
                            ...editingBot,
                            offer_template: event.target.value as AdminBotEdit["offer_template"],
                          })
                        }
                      >
                        <option value="button_reveal">Botão de planos</option>
                        <option value="classic">Lista clássica</option>
                        <option value="catalog_grid">Catálogo em grade</option>
                        <option value="featured">Oferta em destaque</option>
                        <option value="compact">Resumo compacto</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Substituir token do Telegram</Label>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Deixe vazio para manter o token atual"
                        value={editingBot.telegramToken ?? ""}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, telegramToken: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>ID do chat de notificações</Label>
                      <Input
                        type="number"
                        value={editingBot.notify_chat_id ?? ""}
                        onChange={(event) =>
                          setEditingBot({
                            ...editingBot,
                            notify_chat_id: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>ID do chat de mídias</Label>
                      <Input
                        type="number"
                        value={editingBot.media_chat_id ?? ""}
                        onChange={(event) =>
                          setEditingBot({
                            ...editingBot,
                            media_chat_id: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Mensagem de boas-vindas</Label>
                      <Textarea
                        rows={3}
                        value={editingBot.welcome_text}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, welcome_text: event.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Como começar (negrito no Telegram)</Label>
                      <Textarea
                        rows={3}
                        value={editingBot.start_help_text}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, start_help_text: event.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Mensagem após o pagamento</Label>
                      <Textarea
                        rows={3}
                        value={editingBot.after_payment_text}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, after_payment_text: event.target.value })
                        }
                      />
                    </div>
                    <p className="text-sm text-muted-foreground md:col-span-2">
                      As sequências de recuperação são configuradas na aba Funis da conta.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        id="admin-group-photos"
                        type="checkbox"
                        checked={editingBot.group_photos}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, group_photos: event.target.checked })
                        }
                      />
                      <Label htmlFor="admin-group-photos">Agrupar fotos</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="admin-group-videos"
                        type="checkbox"
                        checked={editingBot.group_videos}
                        onChange={(event) =>
                          setEditingBot({ ...editingBot, group_videos: event.target.checked })
                        }
                      />
                      <Label htmlFor="admin-group-videos">Agrupar vídeos</Label>
                    </div>
                    <div className="flex gap-2 md:col-span-2">
                      <Button type="submit" disabled={updateBot.isPending}>
                        Salvar
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditingBot(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}

                <div>
                  <h3 className="mb-2 font-semibold">APIs NXGate</h3>
                  <div className="space-y-3">
                    {selectedDetails.gateways.map((gateway) => (
                      <div key={gateway.id} className="rounded-xl border p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              {gateway.name} · {gateway.environment}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Chave do usuário:{" "}
                              {gateway.hasUserCredentials ? "configurada" : "ausente"} ·
                              Substituição administrativa:{" "}
                              {gateway.hasAdminOverride ? "ativa" : "inativa"}
                            </p>
                          </div>
                          <StatusBadge status={gateway.status} />
                        </div>
                        <form
                          className="flex flex-col gap-2 sm:flex-row"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const key = String(
                              new FormData(event.currentTarget).get("api_key") ?? "",
                            ).trim();
                            if (!key) {
                              toast.error("Informe a nova chave NXGate.");
                              return;
                            }
                            setOverride.mutate({
                              gatewayId: gateway.id,
                              credentials: { api_key: key },
                            });
                            event.currentTarget.reset();
                          }}
                        >
                          <Input
                            name="api_key"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Nova API key (não pode ser consultada depois)"
                          />
                          <Button type="submit" variant="outline" disabled={setOverride.isPending}>
                            <KeyRound className="size-4" /> Substituir
                          </Button>
                          {gateway.hasAdminOverride && (
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={restore.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Restaurar a chave NXGate original definida pelo usuário?",
                                  )
                                )
                                  restore.mutate(gateway.id);
                              }}
                            >
                              Restaurar original
                            </Button>
                          )}
                        </form>
                      </div>
                    ))}
                    {selectedDetails.gateways.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Esta conta não tem gateway NXGate.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold">Usuários Telegram recentes</h3>
                  <div className="space-y-2">
                    {selectedDetails.leads.map((lead) => (
                      <form
                        key={lead.id}
                        className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!lead.bot_id) {
                            toast.error("Este usuário não está associado a um bot.");
                            return;
                          }
                          const form = new FormData(event.currentTarget);
                          renameLead.mutate({
                            leadId: lead.id,
                            botId: lead.bot_id,
                            first_name: String(form.get("first_name") ?? ""),
                            username: String(form.get("username") ?? "").trim() || null,
                          });
                        }}
                      >
                        <Input
                          name="first_name"
                          defaultValue={lead.first_name ?? ""}
                          aria-label="Nome do usuário Telegram"
                        />
                        <Input
                          name="username"
                          defaultValue={lead.username ?? ""}
                          aria-label="Username Telegram"
                          placeholder="username"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          disabled={renameLead.isPending}
                        >
                          Salvar nome
                        </Button>
                        <p className="text-xs text-muted-foreground sm:col-span-3">
                          ID {lead.tg_user_id} · visto {fmtDate(lead.last_seen_at)}
                        </p>
                      </form>
                    ))}
                    {selectedDetails.leads.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum usuário registrado.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold">Vendas recentes</h3>
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="p-3">Data</th>
                          <th className="p-3">Telegram ID</th>
                          <th className="p-3">Valor</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDetails.transactions.map((transaction) => (
                          <tr key={transaction.id} className="border-b last:border-0">
                            <td className="p-3">{fmtDate(transaction.created_at)}</td>
                            <td className="p-3">{transaction.tg_user_id ?? "—"}</td>
                            <td className="p-3">{formatTransactionAmount(transaction)}</td>
                            <td className="p-3">
                              <StatusBadge status={transaction.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {selectedDetails.transactions.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">Nenhuma venda registrada.</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Conta criada em {fmtDate(selectedDetails.profile?.created_at)} · Starts exibidos:{" "}
                  {selectedDetails.starts.length}
                </p>
              </>
            )}
          </section>
        )}

        {activeSection === "overview" && overview.data && (
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 font-semibold">Bots ativos recentes</h2>
              <div className="space-y-2">
                {overview.data.latestBots.map((bot) => (
                  <div
                    key={bot.id}
                    className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
                  >
                    <span>
                      {bot.name} <span className="text-muted-foreground">@{bot.username}</span>
                    </span>
                    <StatusBadge status={bot.active ? "active" : "paused"} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="mb-3 font-semibold">Vendas recentes da plataforma</h2>
              <div className="space-y-2">
                {overview.data.latestTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
                  >
                    <span>
                      {fmtDate(transaction.created_at)} · {formatTransactionAmount(transaction)}
                    </span>
                    <StatusBadge status={transaction.status} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
