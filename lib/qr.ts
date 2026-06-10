import QRCode from "qrcode";

/**
 * Render `text` as a self-contained PNG data URL QR code. Generated locally (no
 * external image service), so the encoded URL — which may carry an in-flight
 * OAuth request — never leaves this server. Modules are dark on a transparent
 * background; render it inside a light, padded container so the quiet zone has
 * contrast and stays scannable in either theme.
 */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#0b0b0c", light: "#00000000" },
  });
}
