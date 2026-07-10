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
}

export interface WeatherForecast {
  location: WeatherLocation;
  daily: DailyForecast[];
}

const HOME_LOCATION_KEY = 'weather.homeLocation';
const FORECAST_DAYS = 7;

@Injectable()
export class WeatherService {
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
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', String(FORECAST_DAYS));
    url.searchParams.set(
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
      ].join(','),
    );
    url.searchParams.set('hourly', 'pressure_msl');

    const res = await this.fetchJson(url);
    const daily = this.buildDailyForecast(res);
    return { location: { lat, lon, label }, daily };
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
