export function isPublicInstance(): boolean {
  const v = process.env.DEGOOG_PUBLIC_INSTANCE ?? "";
  const t = v.trim().toLowerCase();
  return t === "true" || t === "1";
}
