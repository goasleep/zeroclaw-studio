let text = "";

export async function readText(): Promise<string> {
  return text;
}

export async function writeText(value: string): Promise<void> {
  text = value;
}
