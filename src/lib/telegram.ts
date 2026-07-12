import { env } from './env.js';

/**
 * Send a plain text (HTML-formatted) message to the configured Telegram chat.
 *
 * No-ops (with a log) if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID are empty.
 * Never throws — any network or API error is logged and swallowed so that
 * Telegram failures never interrupt the main application flow.
 */
export async function sendTelegram(message: string): Promise<void> {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = env;

  if (!token || !chatId) {
    console.log('[telegram] Skipping notification — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)');
      console.error(
        `[telegram] API error ${response.status} ${response.statusText}: ${body}`,
      );
    }
  } catch (err) {
    console.error('[telegram] Failed to send notification:', err);
  }
}
