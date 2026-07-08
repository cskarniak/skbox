export interface ReolinkImagingSettings {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
}

// L'API ONVIF SetImagingSettings des Reolink répond avec succès sans jamais appliquer le
// changement (firmware limitation connue). Ce client parle à l'API CGI propriétaire de Reolink
// (celle utilisée par leur appli), qui applique réellement les réglages.
export class ReolinkClient {
  private token: string | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly username: string,
    private readonly password: string,
    private readonly channel: number = 0,
  ) {}

  async getImagingSettings(): Promise<ReolinkImagingSettings> {
    const image = await this.getImage();
    return {
      brightness: image.Bright,
      contrast: image.Contrast,
      saturation: image.Saturation,
      sharpness: image.Sharpen,
    };
  }

  async getImagingOptions(): Promise<Record<'brightness' | 'contrast' | 'saturation' | 'sharpness', { min: number; max: number }>> {
    const range = { min: 0, max: 255 };
    return { brightness: range, contrast: range, saturation: range, sharpness: range };
  }

  async setImagingSettings(settings: ReolinkImagingSettings): Promise<void> {
    const current = await this.getImage();
    const image = {
      channel: this.channel,
      Bright: settings.brightness ?? current.Bright,
      Contrast: settings.contrast ?? current.Contrast,
      Saturation: settings.saturation ?? current.Saturation,
      Sharpen: settings.sharpness ?? current.Sharpen,
      Hue: current.Hue,
    };
    await this.call('SetImage', { Image: image });
  }

  private async getImage(): Promise<Record<string, number>> {
    const [result] = await this.call<{ Image: Record<string, number> }>('GetImage', { channel: this.channel });
    return result.value.Image;
  }

  private async call<T = any>(cmd: string, param: Record<string, unknown>): Promise<{ value: T }[]> {
    const token = await this.getToken();
    const res = await fetch(`http://${this.host}:${this.port}/cgi-bin/api.cgi?cmd=${cmd}&token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cmd, action: 0, param }]),
    });
    if (!res.ok) throw new Error(`Reolink ${cmd} a répondu HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const entry = Array.isArray(body) ? body[0] : body;
    if (entry?.error) throw new Error(`Reolink ${cmd} a échoué: ${entry.error.detail ?? JSON.stringify(entry.error)}`);
    return (Array.isArray(body) ? body : [body]) as { value: T }[];
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const res = await fetch(`http://${this.host}:${this.port}/cgi-bin/api.cgi?cmd=Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cmd: 'Login', action: 0, param: { User: { userName: this.username, password: this.password } } }]),
    });
    if (!res.ok) throw new Error(`Reolink Login a répondu HTTP ${res.status}`);
    const body = await res.json();
    const entry = Array.isArray(body) ? body[0] : body;
    const token = entry?.value?.Token?.name;
    if (!token) throw new Error(`Reolink Login a échoué: ${JSON.stringify(entry?.error ?? entry)}`);
    this.token = token;
    return token;
  }
}
