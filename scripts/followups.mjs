const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!baseUrl || !secret) {
  console.error(
    "PUBLIC_BASE_URL and CRON_SECRET are required to run the follow-up worker.",
  );
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`${baseUrl}/api/public/jobs/followups`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const result = await response.text();
    if (!response.ok)
      throw new Error(
        `Follow-up worker returned HTTP ${response.status}: ${result}`,
      );
    const stats = JSON.parse(result);
    if (stats.failed > 0)
      throw new Error(
        `Follow-up worker failed to send ${stats.failed} reminder(s).`,
      );
    console.log(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
