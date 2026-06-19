import { apiFetch } from "./base";

export interface PersonalityTemplateFile {
  filename: string;
  content: string;
}

export interface PersonalityTemplatesResult {
  preset: string;
  files: PersonalityTemplateFile[];
}

export interface PersonalityTemplateParams {
  agent?: string;
  agent_name?: string;
  user_name?: string;
  timezone?: string;
  communication_style?: string;
  include_memory?: boolean;
}

export const apiPersonalityTemplates = (params: PersonalityTemplateParams = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, String(value));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiFetch<PersonalityTemplatesResult>(`/api/personality/templates${suffix}`);
};
