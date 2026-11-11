const MAX_CAPTION_LENGTH = 1024;

export function telegramMediaCaption(caption: string | null, mediaId: string): string {
  const identifier = `ID: ${mediaId}`;
  const separator = caption ? "\n\n" : "";
  const captionLimit = MAX_CAPTION_LENGTH - identifier.length - separator.length;
  const text = caption ? `${caption.slice(0, captionLimit).trimEnd()}${separator}` : "";
  return `${text}${identifier}`;
}
