"use client";

export type AdminNoticeState = {
  ok: boolean;
  message: string;
};

export function AdminNotice({ ok, message }: AdminNoticeState) {
  if (!message) return null;
  return (
    <p className={`text-sm ${ok ? "text-success" : "text-danger"}`}>
      {message}
    </p>
  );
}
