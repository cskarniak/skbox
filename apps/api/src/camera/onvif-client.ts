import { createHash, randomBytes } from 'crypto';
import { XMLParser } from 'fast-xml-parser';

export interface OnvifImagingSettings {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
}

export interface OnvifPreset {
  token: string;
  name: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

export class OnvifClient {
  private profileToken: string | null = null;
  private videoSourceToken: string | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly username: string,
    private readonly password: string,
  ) {}

  async continuousMove(x: number, y: number, zoom: number): Promise<void> {
    const profile = await this.getProfileToken();
    await this.request(
      'ptz_service',
      'http://www.onvif.org/ver20/ptz/wsdl',
      'ContinuousMove',
      `<ProfileToken>${profile}</ProfileToken><Velocity><PanTilt xmlns="http://www.onvif.org/ver10/schema" x="${x}" y="${y}"/><Zoom xmlns="http://www.onvif.org/ver10/schema" x="${zoom}"/></Velocity>`,
    );
  }

  async stop(): Promise<void> {
    const profile = await this.getProfileToken();
    await this.request('ptz_service', 'http://www.onvif.org/ver20/ptz/wsdl', 'Stop', `<ProfileToken>${profile}</ProfileToken><PanTilt>true</PanTilt><Zoom>true</Zoom>`);
  }

  async getPresets(): Promise<OnvifPreset[]> {
    const profile = await this.getProfileToken();
    const res = await this.request('ptz_service', 'http://www.onvif.org/ver20/ptz/wsdl', 'GetPresets', `<ProfileToken>${profile}</ProfileToken>`);
    const presets = res?.Envelope?.Body?.GetPresetsResponse?.Preset ?? [];
    const list = Array.isArray(presets) ? presets : [presets];
    return list
      .filter((p: any) => p && p['@_token'])
      .map((p: any) => ({ token: p['@_token'], name: p.Name ?? p['@_token'] }));
  }

  async gotoPreset(token: string): Promise<void> {
    const profile = await this.getProfileToken();
    await this.request('ptz_service', 'http://www.onvif.org/ver20/ptz/wsdl', 'GotoPreset', `<ProfileToken>${profile}</ProfileToken><PresetToken>${token}</PresetToken>`);
  }

  async setPreset(name: string): Promise<string> {
    const profile = await this.getProfileToken();
    const res = await this.request(
      'ptz_service',
      'http://www.onvif.org/ver20/ptz/wsdl',
      'SetPreset',
      `<ProfileToken>${profile}</ProfileToken><PresetName>${escapeXml(name)}</PresetName>`,
    );
    return res?.Envelope?.Body?.SetPresetResponse?.PresetToken;
  }

  async removePreset(token: string): Promise<void> {
    const profile = await this.getProfileToken();
    await this.request('ptz_service', 'http://www.onvif.org/ver20/ptz/wsdl', 'RemovePreset', `<ProfileToken>${profile}</ProfileToken><PresetToken>${token}</PresetToken>`);
  }

  async getImagingSettings(): Promise<OnvifImagingSettings> {
    const source = await this.getVideoSourceToken();
    const res = await this.request(
      'imaging_service',
      'http://www.onvif.org/ver20/imaging/wsdl',
      'GetImagingSettings',
      `<VideoSourceToken>${source}</VideoSourceToken>`,
    );
    const settings = res?.Envelope?.Body?.GetImagingSettingsResponse?.ImagingSettings ?? {};
    return {
      brightness: numOrUndefined(settings.Brightness),
      contrast: numOrUndefined(settings.Contrast),
      saturation: numOrUndefined(settings.ColorSaturation),
      sharpness: numOrUndefined(settings.Sharpness),
    };
  }

  async getImagingOptions(): Promise<Record<'brightness' | 'contrast' | 'saturation' | 'sharpness', { min: number; max: number }>> {
    const source = await this.getVideoSourceToken();
    const res = await this.request(
      'imaging_service',
      'http://www.onvif.org/ver20/imaging/wsdl',
      'GetOptions',
      `<VideoSourceToken>${source}</VideoSourceToken>`,
    );
    const options = res?.Envelope?.Body?.GetOptionsResponse?.ImagingOptions ?? {};
    const range = (key: string) => ({ min: Number(options?.[key]?.Min ?? 0), max: Number(options?.[key]?.Max ?? 100) });
    return {
      brightness: range('Brightness'),
      contrast: range('Contrast'),
      saturation: range('ColorSaturation'),
      sharpness: range('Sharpness'),
    };
  }

  async setImagingSettings(settings: OnvifImagingSettings): Promise<void> {
    const source = await this.getVideoSourceToken();
    const fields = [
      settings.brightness !== undefined ? `<Brightness>${settings.brightness}</Brightness>` : '',
      settings.contrast !== undefined ? `<Contrast>${settings.contrast}</Contrast>` : '',
      settings.saturation !== undefined ? `<ColorSaturation>${settings.saturation}</ColorSaturation>` : '',
      settings.sharpness !== undefined ? `<Sharpness>${settings.sharpness}</Sharpness>` : '',
    ].join('');
    await this.request(
      'imaging_service',
      'http://www.onvif.org/ver20/imaging/wsdl',
      'SetImagingSettings',
      `<VideoSourceToken>${source}</VideoSourceToken><ImagingSettings>${fields}</ImagingSettings>`,
    );
  }

  private async getProfileToken(): Promise<string> {
    if (!this.profileToken) await this.loadProfile();
    return this.profileToken!;
  }

  private async getVideoSourceToken(): Promise<string> {
    if (!this.videoSourceToken) await this.loadProfile();
    return this.videoSourceToken!;
  }

  private async loadProfile(): Promise<void> {
    const res = await this.request('media_service', 'http://www.onvif.org/ver10/media/wsdl', 'GetProfiles', '');
    const profiles = res?.Envelope?.Body?.GetProfilesResponse?.Profiles;
    const first = Array.isArray(profiles) ? profiles[0] : profiles;
    if (!first) throw new Error("Aucun profil ONVIF trouvé sur la caméra");
    this.profileToken = first['@_token'];
    this.videoSourceToken = first?.VideoSourceConfiguration?.SourceToken;
  }

  private async request(service: string, xmlns: string, action: string, bodyXml: string): Promise<any> {
    const nonce = randomBytes(16);
    const created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const digest = createHash('sha1')
      .update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(this.password)]))
      .digest('base64');
    const nonceB64 = nonce.toString('base64');

    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
<s:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${escapeXml(this.username)}</wsse:Username>
<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceB64}</wsse:Nonce>
<wsu:Created>${created}</wsu:Created></wsse:UsernameToken></wsse:Security></s:Header>
<s:Body><${action} xmlns="${xmlns}">${bodyXml}</${action}></s:Body></s:Envelope>`;

    const res = await fetch(`http://${this.host}:${this.port}/onvif/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml' },
      body: soap,
    });
    const text = await res.text();
    const parsed = parser.parse(text);
    const fault = parsed?.Envelope?.Body?.Fault;
    if (fault) {
      throw new Error(`ONVIF ${action} a échoué: ${fault?.Reason?.Text ?? JSON.stringify(fault)}`);
    }
    if (!res.ok) throw new Error(`ONVIF ${action} a répondu HTTP ${res.status}`);
    return parsed;
  }
}

function numOrUndefined(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}
