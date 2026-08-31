export type ConsultantMode = 'consult' | 'audit' | 'plan';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  mode?: ConsultantMode;
  isError?: boolean;
}

export interface PromptPill {
  label: string;
  query: string;
  icon?: string;
  category?: string;
}

export interface ModeConfig {
  id: ConsultantMode;
  name: string;
  tagline: string;
  greeting: string;
  iconName: string;
  accentColor: string;
  description: string;
  pills: PromptPill[];
  systemInstruction: string;
}
