import { request as httpsRequest, Agent } from 'https';

export interface ReolinkImagingSettings {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
}

// Reolink cameras expose their web UI/CGI API over HTTPS with a self-signed certificate — this
// agent is scoped to Reolink requests only, it does not weaken TLS verification process-wide.
const insecureAgent = new Agent({ rejectUnauthorized: false });

// L'API ONVIF SetImagingSettings des Reolink répond avec succès sans jamais appliquer le
// changement (firmware limitation connue). Ce client parle à l'API CGI propriétaire de Reolink
// (celle utilisée par leur appli, en HTTPS sur le port 443), qui applique réellement les réglages.
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
      brightness: image.bright,
      contrast: image.contrast,
      saturation: image.saturation,
      sharpness: image.sharpen,
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
      bright: settings.brightness ?? current.bright,
      contrast: settings.contrast ?? current.contrast,
      saturation: settings.saturation ?? current.saturation,
      sharpen: settings.sharpness ?? current.sharpen,
      hue: current.hue,
    };
    await this.call('SetImage', { Image: image });
  }

  private async getImage(): Promise<Record<string, number>> {
    const [result] = await this.call<{ Image: Record<string, number> }>('GetImage', { channel: this.channel });
    return result.value.Image;
  }

  private async call<T = any>(cmd: string, param: Record<string, unknown>): Promise<{ value: T }[]> {
    const token = await this.getToken();
    const body = await this.post(`/cgi-bin/api.cgi?cmd=${cmd}&token=${token}`, [{ cmd, action: 0, param }]);
    const entry = Array.isArray(body) ? body[0] : body;
    if (entry?.error) throw new Error(`Reolink ${cmd} a échoué: ${entry.error.detail ?? JSON.stringify(entry.error)}`);
    return (Array.isArray(body) ? body : [body]) as { value: T }[];
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const body = await this.post('/cgi-bin/api.cgi?cmd=Login', [
      { cmd: 'Login', action: 0, param: { User: { userName: this.username, password: this.password } } },
    ]);
    const entry = Array.isArray(body) ? body[0] : body;
    const token = entry?.value?.Token?.name;
    if (!token) throw new Error(`Reolink Login a échoué: ${JSON.stringify(entry?.error ?? entry)}`);
    this.token = token;
    return token;
  }

  private post(path: string, payload: unknown): Promise<any> {
    const data = Buffer.from(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          agent: insecureAgent,
          host: this.host,
          port: this.port,
          path,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Reolink a répondu HTTP ${res.statusCode}`));
              return;
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
            } catch (err: any) {
              reject(new Error(`Réponse Reolink invalide: ${err.message}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}
