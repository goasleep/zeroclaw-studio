import { z } from "zod";
import type { ConfigListEntry } from "@/api/config";

export interface ParsedConfigDraft {
  value: unknown;
}

export function defaultDraft(entry: ConfigListEntry) {
  if (entry.is_secret) return "";
  const value = entry.value;
  if (value == null || value === "<unset>") {
    if (entry.kind === "string-array" || entry.kind === "object-array") return "[]";
    return "";
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function parseConfigDraft(entry: ConfigListEntry, value: string): ParsedConfigDraft {
  const schema = schemaForEntry(entry);
  return { value: schema.parse(value) };
}

export function parseRawConfigDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export function configDraftError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid config value";
  return null;
}

function schemaForEntry(entry: ConfigListEntry) {
  if (entry.kind === "bool") {
    return z.enum(["true", "false"]).transform((value) => value === "true");
  }
  if (entry.kind === "integer") {
    return z
      .string()
      .trim()
      .refine((value) => value === "" || Number.isInteger(Number(value)), "Enter an integer")
      .transform((value) => (value === "" ? "" : Number(value)));
  }
  if (entry.kind === "float") {
    return z
      .string()
      .trim()
      .refine((value) => value === "" || Number.isFinite(Number(value)), "Enter a number")
      .transform((value) => (value === "" ? "" : Number(value)));
  }
  if (entry.kind === "enum" && entry.enum_variants?.length) {
    return z
      .string()
      .refine(
        (value) => value === "" || entry.enum_variants?.includes(value),
        "Choose a valid option",
      );
  }
  if (entry.kind === "string-array") return z.string().transform(parseStringArray);
  if (entry.kind === "object-array") {
    return z.string().transform((value, ctx) => {
      const trimmed = value.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // handled below
      }
      ctx.addIssue({ code: "custom", message: "Enter a JSON array" });
      return z.NEVER;
    });
  }
  return z.string();
}

function parseStringArray(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fall through to newline/comma parsing.
    }
  }
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
