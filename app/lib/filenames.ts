const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function exportBaseName(value: string, fallback = "branchtopo"): string {
  const withoutControlCharacters = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  ).join("");
  const normalized = withoutControlCharacters
    .normalize("NFKC")
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  if (!normalized) return fallback;
  return WINDOWS_RESERVED_NAME.test(normalized) ? `_${normalized}` : normalized;
}

export function projectFileNames(structureName: string, typeName: string) {
  const structure = exportBaseName(structureName, "structure");
  const type = exportBaseName(typeName, "type");
  return {
    variantBase: `${structure}_${type}`,
    standardBase: `${structure}_standard`,
  };
}
