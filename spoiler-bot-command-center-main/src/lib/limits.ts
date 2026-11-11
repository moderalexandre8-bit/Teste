// Account limits shared by the panel (to show/disable buttons) and the server.
// The database enforces the same limit with a trigger.
export const MAX_BOTS_PER_ACCOUNT = 100;

export const canAddBot = (currentBots: number) => currentBots < MAX_BOTS_PER_ACCOUNT;

/** @usuario rules: 3–24 chars, lowercase letters, numbers, _ and . */
export const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
export const normalizeUsername = (v: string) => v.trim().replace(/^@+/, "").toLowerCase();
