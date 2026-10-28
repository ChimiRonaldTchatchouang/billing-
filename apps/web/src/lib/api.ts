const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function verifierApi(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}
