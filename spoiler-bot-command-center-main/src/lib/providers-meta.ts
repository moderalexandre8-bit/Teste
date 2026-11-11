// Client-safe description of every payment provider. The server adapters in
// src/lib/backend/gateways implement the operations; this file only describes them.

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea" | "file";
  placeholder?: string;
  required?: boolean;
  help?: string;
};

export type ProviderMeta = {
  id: string;
  label: string;
  docs: string;
  color: string;
  capabilities: {
    cashin: boolean;
    cashout: boolean;
    balance: boolean;
    split: boolean;
    subaccounts: boolean;
  };
  credentialFields: FieldDef[];
  configFields: FieldDef[];
  requirements: string[];
  webhookHelp: string;
};

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "nxgate",
    label: "NXGate",
    docs: "https://github.com/nxgate/nxgate-sdk-nodejs",
    color: "chart-1",
    capabilities: { cashin: true, cashout: true, balance: true, split: true, subaccounts: false },
    credentialFields: [
      {
        key: "api_key",
        label: "Chave de API (API Full)",
        type: "password",
        required: true,
        help: "Cole a chave de API que a NXGate te deu.",
      },
    ],
    configFields: [],
    requirements: ["Conta NXGate com API liberada (Chave de API)."],
    webhookHelp:
      "O endereço abaixo é enviado automaticamente em cada Pix e saque — não precisa cadastrar nada na NXGate.",
  },
  {
    id: "lustify",
    label: "Lustify (Internacional)",
    docs: "https://docs.lustify.dev/payments/",
    color: "chart-2",
    capabilities: { cashin: true, cashout: false, balance: true, split: false, subaccounts: false },
    credentialFields: [
      {
        key: "api_key",
        label: "API key da Lustify",
        type: "password",
        required: true,
        placeholder: "sk_test_... ou sk_live_...",
        help: "Use sk_test_ para testes; produção cobra em USD de verdade.",
      },
      {
        key: "webhook_secret",
        label: "Webhook signing secret",
        type: "password",
        required: true,
        help: "Crie um endpoint HTTPS na Lustify para payment.succeeded e payment.failed e cole o signing_secret mostrado uma única vez.",
      },
    ],
    configFields: [],
    requirements: [
      "Conta Lustify com API key do ambiente escolhido.",
      "Configure o webhook mostrado após salvar. Checkout em USD; planos precisam de preço Lustify e imagem pública.",
    ],
    webhookHelp:
      "Cadastre esta URL na Lustify para payment.succeeded e payment.failed; valide e salve o signing_secret no gateway.",
  },
];

export const providerMeta = (id: string) => PROVIDERS.find((p) => p.id === id);

export const PIX_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const;

export const brl = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
