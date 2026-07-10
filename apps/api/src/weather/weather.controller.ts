import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WeatherLocation, WeatherService } from './weather.service';

@ApiTags('weather')
@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get('home')
  getHomeForecast() {
    return this.weather.getHomeForecast();
  }

  @Get('home/location')
  getHomeLocation() {
    return this.weather.getHomeLocation();
  }

  @Put('home/location')
  setHomeLocation(@Body() location: WeatherLocation) {
    return this.weather.setHomeLocation(location);
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.weather.searchLocations(q ?? '');
  }

  @Get('forecast')
  getForecast(@Query('lat') lat: string, @Query('lon') lon: string, @Query('label') label?: string) {
    return this.weather.getForecast(Number(lat), Number(lon), label ?? 'Lieu recherché');
  }
}
