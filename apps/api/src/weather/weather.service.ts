import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface WeatherLocation {
  lat: number;
  lon: number;
  label: string;
}

export interface LocationSearchResult {
  name: string;
  admin1: string | null;
  country: string | null;
  lat: number;
  lon: number;
  population: number | null;
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  windGustsMax: number;
  uvIndexMax: number;
  sunshineHours: number;
  pressureMean: number | null;
  sunrise: string; // ISO local, ex: 2026-07-17T06:12
  sunset: string;
}

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  date: string; // YYYY-MM-DD
}

export interface HourlyForecast {
  time: string; // ISO local, ex: 2026-07-10T14:00
  weatherCode: number;
  temperature: number;
  precipitationProbability: number;
  precipitation: number;
  windSpeed: number;
}

export interface WeatherForecast {
  location: WeatherLocation;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
}

const HOME_LOCATION_KEY = 'weather.homeLocation';
const FORECAST_DAYS = 7;
const HOURLY_HOURS = 48;

@Injectable()
export class WeatherService {
  // Mémoïse la prévision journalière (qui contient le lever/coucher) par date d'appel,
  // pour éviter de re-solliciter Open-Meteo à chaque évaluation d'un déclencheur solaire
  // ou d'un profil de simulation de présence le même jour.
  private sunCache: { fetchedDate: string; daily: DailyForecast[] } | null = null;

  constructor(private readonly settings: SettingsService) {}

  async getHomeLocation(): Promise<WeatherLocation | null> {
    const raw = await this.settings.get(HOME_LOCATION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WeatherLocation;
    } catch {
      return null;
    }
  }

  async setHomeLocation(location: WeatherLocation): Promise<WeatherLocation> {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon) || !location.label?.trim()) {
      throw new BadRequestException('Lieu invalide');
    }
    await this.settings.set(HOME_LOCATION_KEY, JSON.stringify(location));
    return location;
  }

  async getHomeForecast(): Promise<WeatherForecast> {
    const location = await this.getHomeLocation();
    if (!location) {
      throw new BadRequestException("Aucun lieu par défaut n'est configuré");
    }
    return this.getForecast(location.lat, location.lon, location.label);
  }

  // Lever/coucher du soleil pour le lieu par défaut, `dayOffset` jours à partir
  // d'aujourd'hui (0 = aujourd'hui, 1 = demain). Retourne `null` (jamais de throw)
  // si aucun lieu n'est configuré ou si Open-Meteo est injoignable — les appelants
  // (déclencheurs solaires des scénarios, simulation de présence) doivent traiter ce
  // cas en réessayant plus tard plutôt qu'en plantant.
  async getSunTimes(dayOffset: 0 | 1 = 0): Promise<SunTimes | null> {
    // Date locale (pas toISOString, qui est en UTC) : entre 00h00 et 02h00 heure de Paris
    // l'été (UTC+2), la date UTC est encore celle de la veille, ce qui ferait considérer
    // le cache comme frais alors qu'il contient les horaires solaires du jour précédent —
    // décalant d'un jour tout calcul basé sur dayOffset (déclencheurs solaires, simulation
    // de présence) juste après minuit local.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!this.sunCache || this.sunCache.fetchedDate !== today) {
      try {
        const forecast = await this.getHomeForecast();
        this.sunCache = { fetchedDate: today, daily: forecast.daily };
      } catch {
        return null;
      }
    }
    const entry = this.sunCache.daily[dayOffset];
    if (!entry) return null;
    return { sunrise: new Date(entry.sunrise), sunset: new Date(entry.sunset), date: entry.date };
  }

  // Le géocodage Open-Meteo (GeoNames) fait une correspondance quasi exacte sur le nom en
  // base, qui pour les communes françaises composées est écrit avec des tirets
  // ("Saint-Étienne"). Une recherche "St Etienne" ou "Saint Etienne" (espaces, abréviation)
  // ne renvoie donc rien ou un hameau homonyme au lieu de la ville. On essaie donc plusieurs
  // variantes de la requête (abréviations développées, espaces remplacés par des tirets) et
  // on fusionne les résultats, triés par population décroissante pour faire remonter la
  // ville plutôt qu'un hameau du même nom.
  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const expanded = trimmed.replace(/\bste\.?\b/gi, 'Sainte').replace(/\bst\.?\b/gi, 'Saint');
    const candidates = [...new Set([expanded, expanded.replace(/\s+/g, '-')])];

    const resultsByCandidate = await Promise.all(candidates.map((c) => this.fetchLocations(c)));

    const merged = new Map<string, LocationSearchResult>();
    for (const results of resultsByCandidate) {
      for (const r of results) {
        merged.set(`${r.lat.toFixed(3)},${r.lon.toFixed(3)}`, r);
      }
    }

    return [...merged.values()].sort((a, b) => (b.population ?? 0) - (a.population ?? 0)).slice(0, 8);
  }

  private async fetchLocations(name: string): Promise<LocationSearchResult[]> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', name);
    url.searchParams.set('count', '10');
    url.searchParams.set('language', 'fr');
    url.searchParams.set('format', 'json');

    const res = await this.fetchJson(url);
    const results = Array.isArray(res.results) ? res.results : [];
    return results.map((r: any) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      country: r.country ?? null,
      lat: r.latitude,
      lon: r.longitude,
      population: r.population ?? null,
    }));
  }

  async getForecast(lat: number, lon: number, label: string): Promise<WeatherForecast> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new BadRequestException('Coordonnées invalides');
    }
    const dailyUrl = new URL('https://api.open-meteo.com/v1/forecast');
    dailyUrl.searchParams.set('latitude', String(lat));
    dailyUrl.searchParams.set('longitude', String(lon));
    dailyUrl.searchParams.set('timezone', 'auto');
    dailyUrl.searchParams.set('forecast_days', String(FORECAST_DAYS));
    dailyUrl.searchParams.set(
      'daily',
      [
        'weathercode',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'precipitation_probability_max',
        'windspeed_10m_max',
        'windgusts_10m_max',
        'uv_index_max',
        'sunshine_duration',
        'sunrise',
        'sunset',
      ].join(','),
    );
    dailyUrl.searchParams.set('hourly', 'pressure_msl');

    // Requête séparée avec forecast_hours (plutôt que forecast_days) pour aligner les
    // données horaires sur l'heure actuelle plutôt que sur le début de la journée.
    const hourlyUrl = new URL('https://api.open-meteo.com/v1/forecast');
    hourlyUrl.searchParams.set('latitude', String(lat));
    hourlyUrl.searchParams.set('longitude', String(lon));
    hourlyUrl.searchParams.set('timezone', 'auto');
    hourlyUrl.searchParams.set('forecast_hours', String(HOURLY_HOURS));
    hourlyUrl.searchParams.set(
      'hourly',
      ['weathercode', 'temperature_2m', 'precipitation_probability', 'precipitation', 'windspeed_10m'].join(','),
    );

    const [dailyRes, hourlyRes] = await Promise.all([this.fetchJson(dailyUrl), this.fetchJson(hourlyUrl)]);
    const daily = this.buildDailyForecast(dailyRes);
    const hourly = this.buildHourlyForecast(hourlyRes);
    return { location: { lat, lon, label }, daily, hourly };
  }

  private buildDailyForecast(res: any): DailyForecast[] {
    const dates: string[] = res.daily?.time ?? [];
    const pressureByDate = this.aggregateHourlyPressure(res.hourly);

    return dates.map((date, i) => ({
      date,
      weatherCode: res.daily.weathercode[i],
      tempMax: res.daily.temperature_2m_max[i],
      tempMin: res.daily.temperature_2m_min[i],
      precipitationSum: res.daily.precipitation_sum[i],
      precipitationProbabilityMax: res.daily.precipitation_probability_max[i],
      windSpeedMax: res.daily.windspeed_10m_max[i],
      windGustsMax: res.daily.windgusts_10m_max[i],
      uvIndexMax: res.daily.uv_index_max[i],
      sunshineHours: res.daily.sunshine_duration[i] / 3600,
      pressureMean: pressureByDate.get(date) ?? null,
      sunrise: res.daily.sunrise[i],
      sunset: res.daily.sunset[i],
    }));
  }

  private buildHourlyForecast(res: any): HourlyForecast[] {
    const times: string[] = res.hourly?.time ?? [];
    return times.map((time, i) => ({
      time,
      weatherCode: res.hourly.weathercode[i],
      temperature: res.hourly.temperature_2m[i],
      precipitationProbability: res.hourly.precipitation_probability[i],
      precipitation: res.hourly.precipitation[i],
      windSpeed: res.hourly.windspeed_10m[i],
    }));
  }

  private aggregateHourlyPressure(hourly: any): Map<string, number> {
    const result = new Map<string, number>();
    const times: string[] = hourly?.time ?? [];
    const values: number[] = hourly?.pressure_msl ?? [];
    const sums = new Map<string, { total: number; count: number }>();
    times.forEach((t, i) => {
      const date = t.slice(0, 10);
      const value = values[i];
      if (!Number.isFinite(value)) return;
      const entry = sums.get(date) ?? { total: 0, count: 0 };
      entry.total += value;
      entry.count += 1;
      sums.set(date, entry);
    });
    sums.forEach((entry, date) => result.set(date, entry.total / entry.count));
    return result;
  }

  private async fetchJson(url: URL): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new ServiceUnavailableException('Impossible de contacter le service météo');
    }
    if (!res.ok) {
      throw new ServiceUnavailableException('Le service météo a répondu une erreur');
    }
    return res.json();
  }
}
