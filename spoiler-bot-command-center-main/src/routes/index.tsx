import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TigerBot — Seus bots de vendas VIP" },
      {
        name: "description",
        content: "Crie sua conta e venda acesso VIP no Telegram com até 100 bots e Pix automático.",
      },
      { property: "og:title", content: "TigerBot — Seus bots de vendas VIP" },
      {
        property: "og:description",
        content: "Crie sua conta e venda acesso VIP no Telegram com até 100 bots e Pix automático.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
