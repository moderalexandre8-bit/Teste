// Add new providers here: implement GatewayAdapter and describe it in src/lib/providers-meta.ts.
import type { GatewayAdapter } from "./types";
import { lustify } from "./lustify";
import { nxgate } from "./nxgate";

const adapters: Record<string, GatewayAdapter> = { nxgate, lustify };

export const getAdapter = (id: string) => adapters[id];
