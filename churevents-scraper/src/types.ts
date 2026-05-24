export interface RegionalEvent {
  id: string;
  title: string;
  category: 'music' | 'stage' | 'markets' | 'family' | 'sport';
  description: string;
  date: string; // YYYY-MM-DD
  time: string;
  price: string;
  municipality: string;
  locationName: string;
  lat: number;
  lng: number;
  image?: string;
  website?: string;
  ticketUrl?: string;
  source: string; // e.g., "Facebook", "Instagram", "Stadt Chur Kalender"
  originalSocialLink?: string;
}

export interface ScrapingRequest {
  query: string; // e.g. "Konzerte und Flohmärkte"
  location: string; // e.g. "Chur"
  sourcePlatform?: 'all' | 'facebook' | 'instagram' | 'guidle' | 'local_boards';
}

export interface ScrapingResult {
  events: RegionalEvent[];
  sources: { title: string; uri: string }[];
  summary: string;
}
