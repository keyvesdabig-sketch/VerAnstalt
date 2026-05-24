import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { RegionalEvent } from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory event store starting empty for clean scraping. Seed events can be manually loaded.
const SEED_EVENTS: RegionalEvent[] = [
  {
    id: "seed-1",
    title: "Churer Samstagsmarkt & Flohmarkt",
    category: "markets",
    description: "Schlendere durch die geschichtsträchtige Altstadt von Chur. Lokale Aussteller präsentieren erlesenen Trödel, antike Schätze und handgemachte Bündner Spezialitäten. Perfekt für einen gemütlichen Wochenendauftakt mit feinem Kaffee.",
    date: "2026-06-06",
    time: "08:00 - 13:00",
    price: "Eintritt frei",
    municipality: "Chur",
    locationName: "Arcasplatz, Chur",
    lat: 46.8481,
    lng: 9.5318,
    image: "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=800&q=80",
    source: "Stadt Chur Kalender"
  },
  {
    id: "seed-2",
    title: "Jazz & Blues im Werkstatt Club",
    category: "music",
    description: "Ein intimer Abend voller cooler Hooks, gefühlvoller Melodien und erstklassiger Live-Improvisation. Lokale Talente treffen auf nationale Solisten in der gemütlichsten Club-Atmosphäre der Region.",
    date: "2026-06-12",
    time: "20:30 - 23:30",
    price: "CHF 25.-",
    municipality: "Chur",
    locationName: "Werkstatt Chur, Theaterweg 1",
    lat: 46.8512,
    lng: 9.5305,
    image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80",
    source: "Facebook Events",
    originalSocialLink: "https://www.facebook.com/events/werkstattchur"
  },
  {
    id: "seed-3",
    title: "Theater Chur: Die Alpen-Tragödie",
    category: "stage",
    description: "Ein packendes zeitgenössisches Schauspiel über die Kontraste zwischen alpiner Tradition, unbändiger Bergwelt und moderner Hektik. Inszeniert vom gefeierten Graubündner Gast-Ensemble.",
    date: "2026-06-18",
    time: "19:30 - 21:30",
    price: "ab CHF 35.-",
    municipality: "Chur",
    locationName: "Theater Chur, Zeughausstrasse 9",
    lat: 46.8525,
    lng: 9.5332,
    image: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80",
    source: "Guidle Kultur"
  },
  {
    id: "seed-4",
    title: "Bündner Familientag & Spielefest",
    category: "family",
    description: "Ein bunter Spiele- und Erlebnistag für Gross und Klein auf dem grosszügigen Quaderwiese-Areal! Mit Hüpfburgen, kreativem Basteln, Geschichtenerzählen, Torwandschiessen und feinstem Street Food.",
    date: "2026-06-21",
    time: "10:00 - 17:00",
    price: "Eintritt frei",
    municipality: "Chur",
    locationName: "Quaderwiese, Chur",
    lat: 46.8538,
    lng: 9.5348,
    image: "https://images.unsplash.com/photo-1472289065668-ce650ac443d2?auto=format&fit=crop&w=800&q=80",
    source: "Instagram Regional",
    originalSocialLink: "https://www.instagram.com/churevents"
  },
  {
    id: "seed-5",
    title: "Churwaldner Berglauf & Trailrun",
    category: "sport",
    description: "Spüre das Adrenalin beim traditionsreichsten Berglauf der Surselva! Traumhafte Singletrails und eine knackige Steigung fordern Läufer heraus. Atemberaubendes Alpenpanorama garantiert.",
    date: "2026-07-04",
    time: "09:00 - 15:00",
    price: "CHF 40.- (inkl. Finisher-T-Shirt)",
    municipality: "Churwalden",
    locationName: "Sportverein Churwalden, Hauptstrasse",
    lat: 46.7801,
    lng: 9.5345,
    image: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=800&q=80",
    source: "Churwalden Tourismus"
  },
  {
    id: "seed-6",
    title: "Sport & Bike-Day Felsberg",
    category: "sport",
    description: "Ein Treffen für alle Mountainbike-Begeisterten und Trailsucher. Geführte E-Bike-Touren, Fahrtechnik-Kurse für Kinder und Testcenter mit den neuesten High-End-Bikes namhafter Marken.",
    date: "2026-06-27",
    time: "10:00 - 18:00",
    price: "Eintritt frei (Kurse kostenpflichtig)",
    municipality: "Felsberg",
    locationName: "Schulhausplatz Felsberg",
    lat: 46.8435,
    lng: 9.4712,
    image: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80",
    source: "Facebook Events"
  }
];

let localEvents: RegionalEvent[] = [];

// Lazily initialized GoogleGenAI instance
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// ---------------------------
// REST API REST ENDPOINTS
// ---------------------------

// Get all events
app.get("/api/events", (req, res) => {
  res.json(localEvents);
});

// Create a custom event
app.post("/api/events", (req, res) => {
  const newEvent: RegionalEvent = {
    ...req.body,
    id: `custom-${Date.now()}`
  };
  localEvents.unshift(newEvent);
  res.status(201).json(newEvent);
});

// Delete an event
app.delete("/api/events/:id", (req, res) => {
  const { id } = req.params;
  localEvents = localEvents.filter(e => e.id !== id);
  res.json({ success: true });
});

// Clear all events from the curation list
app.post("/api/events/clear", (req, res) => {
  localEvents = [];
  res.json({ success: true });
});

// Seed the curation list with regional mock events
app.post("/api/events/seed", (req, res) => {
  localEvents = [...SEED_EVENTS];
  res.json({ success: true, events: SEED_EVENTS });
});

// Helper to generate elegant simulated mock events for local municipalities when key is missing or quota/rate limits are hit
function generateSimulatedEvents(targetLocation: string, searchKeywords: string, platform: string): RegionalEvent[] {
  let baseLat = 46.8508;
  let baseLng = 9.5320;
  
  // adjust base coordinates based on chosen municipality
  if (targetLocation === "Landquart") { baseLat = 46.9698; baseLng = 9.5762; }
  else if (targetLocation === "Thusis") { baseLat = 46.6974; baseLng = 9.4443; }
  else if (targetLocation === "Churwalden") { baseLat = 46.7801; baseLng = 9.5345; }
  else if (targetLocation === "Domat/Ems") { baseLat = 46.8344; baseLng = 9.4485; }

  return [
    {
      id: `scraped-sim-${Date.now()}-1`,
      title: `${targetLocation} OpenAir-Konzert am See`,
      category: "music",
      description: `Live auf der Freilichtbühne! Entdeckt beim Social-Media-Scraping auf Facebook. Tolle Bands, lockere Picknick-Atmosphäre und laue Sommernächte. Suchbegriff: "${searchKeywords}".`,
      date: "2026-07-15",
      time: "18:30 - 23:00",
      price: "CHF 15.-",
      municipality: targetLocation,
      locationName: `Seepromenade, ${targetLocation}`,
      lat: baseLat + 0.003 - Math.random() * 0.006,
      lng: baseLng + 0.003 - Math.random() * 0.006,
      image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80",
      source: platform === 'all' ? "Facebook Events" : `${platform.toUpperCase()} Post`,
      originalSocialLink: `https://www.${platform === 'all' ? 'facebook' : platform}.com/search?q=${encodeURIComponent(searchKeywords)}`
    },
    {
      id: `scraped-sim-${Date.now()}-2`,
      title: `Regionaler Genuss- & Bauernmarkt ${targetLocation}`,
      category: "markets",
      description: `Gemeindetipp aus Instagram gepostet. Frisches Gemüse, Alpkäse, hausgemachte Konfitüren und lokales Kunsthandwerk direkt vom Erzeuger. Ideal für bewusste Genießer.`,
      date: "2026-06-20",
      time: "09:00 - 15:00",
      price: "Eintritt frei",
      municipality: targetLocation,
      locationName: `Dorfplatz, ${targetLocation}`,
      lat: baseLat + 0.004 - Math.random() * 0.008,
      lng: baseLng + 0.004 - Math.random() * 0.008,
      image: "https://images.unsplash.com/photo-1488459718432-01055e67e1f5?auto=format&fit=crop&w=800&q=80",
      source: "Instagram",
      originalSocialLink: "https://www.instagram.com/explore/tags/localmarket"
    },
    {
      id: `scraped-sim-${Date.now()}-3`,
      title: `Kinder-Kreativnachmittag Graubünden`,
      category: "family",
      description: `Gefunden über Social Web Suche. Ein lustiges Beisammensein für Kinder ab 4 Jahren zum Malen, Basteln und Naturmaterialien entdecken.`,
      date: "2026-06-14",
      time: "14:00 - 17:00",
      price: "Eintritt frei (Kollekte)",
      municipality: targetLocation,
      locationName: `Evangelisches Kirchgemeindehaus, ${targetLocation}`,
      lat: baseLat + 0.005 - Math.random() * 0.01,
      lng: baseLng + 0.005 - Math.random() * 0.01,
      image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=800&q=80",
      source: "Guidle / Web-Query"
    }
  ];
}

// Scrape regional events using Search Grounding (Live API) or mock simulator
app.post("/api/events/scrape", async (req, res) => {
  const { query, location, sourcePlatform } = req.body;
  const targetLocation = location || "Chur";
  const searchKeywords = query || "Events, Konzerte, Flohmarkt, Sport";
  const platform = sourcePlatform || "all";

  console.log(`Scraping triggered. Location: ${targetLocation}, Keywords: ${searchKeywords}, Platform: ${platform}`);

  const ai = getGeminiClient();

  if (!ai) {
    // API KEY is missing — return highly tailored, beautiful simulated scraped events
    console.log("No GEMINI_API_KEY provided or it is placeholder. Returning high-fidelity simulation.");
    
    const generatedMocks = generateSimulatedEvents(targetLocation, searchKeywords, platform);

    // Simulating delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Append to local store so they appear in dashboard
    localEvents = [...generatedMocks, ...localEvents];

    return res.json({
      events: generatedMocks,
      sources: [
        { title: `Facebook Suchanfrage für "${searchKeywords}" in ${targetLocation}`, uri: "https://facebook.com" },
        { title: `Instagram Hashtag-Feed #${targetLocation}Events`, uri: "https://instagram.com" }
      ],
      summary: `HINWEIS: Dies ist eine Simulation zwecks Vorführung. Um echtes Live-Scraping über Google Search Grounding zu aktivieren, trage bitte deinen GEMINI_API_KEY im "Settings & Secrets" Panel unseres Editors ein!`
    });
  }

  // GEMINI API CALL WITH SEARCH GROUNDING
  try {
    // Build search prompt optimizing Social platforms integration and Web query parameters
    let socialQueryModifier = "";
    if (platform === "facebook") {
      socialQueryModifier = "Focus strictly on public Facebook events or facebook.com posts.";
    } else if (platform === "instagram") {
      socialQueryModifier = "Focus on public Instagram hashtags or local business posts.";
    } else {
      socialQueryModifier = "Search across public social media platforms (Facebook, Instagram, LinkedIn, Meetup) and local tourism/municipal calenders (e.g. Guidle, Stadtkalender).";
    }

    const prompt = `
      Du bist ein Experte im Extrahieren von regionalen Eventdaten aus Live-Websuchen und Social Media.
      Führe eine Suche durch und extrahiere echte, bevorstehende Veranstaltungen (Konzerte, Märkte, Ausstellungen, Sportevents, Feste) in "${targetLocation}".
      Keywords für das Event-Scraping: "${searchKeywords}".
      Plattform-Einschränkung: "${platform}" (${socialQueryModifier}).
      Aktuelles Jahr ist 2026.
      
      Stelle sicher, dass du nur plausible, echte Events mit realistischen Daten und geographischen Koordinaten (lat, lng) in oder ganz nah bei "${targetLocation}" lieferst. 
      Liefere exakte Breiten- und Längengrade (z.B. nahe Chur: lat ca. 46.85, lng ca. 9.53).
      
      Weise jedem Event eine der Kategorien zu: ["music", "stage", "markets", "family", "sport"]
    `;

    console.log("Calling Gemini API with Search Grounding...");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            events: {
              type: Type.ARRAY,
              description: "Liste der gescrapten Veranstaltungen",
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Spannender Event name" },
                  category: { type: Type.STRING, description: "Muss exakt sein: music, stage, markets, family, oder sport" },
                  description: { type: Type.STRING, description: "Kurze Beschreibung des Events, Programms oder Künstlers" },
                  date: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
                  time: { type: Type.STRING, description: "Uhrzeit, z.B. 19:30 - 22:30 oder 14:00" },
                  price: { type: Type.STRING, description: "Eintrittspreis oder Kollekte oder Eintritt frei" },
                  municipality: { type: Type.STRING, description: "Die Gemeinde, z.B. Chur" },
                  locationName: { type: Type.STRING, description: "Genauer Ort, Saal, Wiese oder Bar-Name" },
                  lat: { type: Type.NUMBER, description: "Geographische Latitude für die Leaflet Karte" },
                  lng: { type: Type.NUMBER, description: "Geographische Longitude für die Leaflet Karte" },
                  image: { type: Type.STRING, description: "Ein passendes, echtes oder verlässliches Unsplash Bild-URL passend zur Eventkategorie" },
                  website: { type: Type.STRING, description: "Webseite der Veranstaltung" },
                  ticketUrl: { type: Type.STRING, description: "Ticket Vorverkaufseite, falls vorhanden" },
                  source: { type: Type.STRING, description: "Name des Herkunftsnetzwerks (z.B. Facebook Events, Instagram Hash, Guidle)" },
                  originalSocialLink: { type: Type.STRING }
                },
                required: ["title", "category", "description", "date", "time", "price", "locationName", "lat", "lng", "source"]
              }
            },
            summary: { type: Type.STRING, description: "Zusammenfassung der Scraping-Resultate und welche Quellen gefunden wurden." }
          },
          required: ["events", "summary"]
        }
      }
    });

    const responseText = response.text;
    console.log("Response text received from Gemini successfully.");
    
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText.trim());
    } catch (parseErr) {
      console.error("Failed to parse JSON response from Gemini:", responseText);
      throw new Error("Invalid structured JSON received from scraper AI.");
    }

    // Adapt scraped events to guarantee unique IDs and basic sanity checks
    const events: RegionalEvent[] = (parsedResult.events || []).map((ev: any, i: number) => {
      // Validate category
      const validCategories = ["music", "stage", "markets", "family", "sport"];
      let cat = ev.category || "music";
      if (!validCategories.includes(cat)) {
        cat = "music";
      }

      return {
        id: `scraped-live-${Date.now()}-${i}`,
        title: ev.title || "Unbekannte Veranstaltung",
        category: cat,
        description: ev.description || "In den sozialen Netzwerken wurden leider keine näheren Beschreibungen geteilt.",
        date: ev.date || "2026-06-30",
        time: ev.time || "Ganztägig",
        price: ev.price || "Keine Angabe",
        municipality: ev.municipality || targetLocation,
        locationName: ev.locationName || ev.municipality || targetLocation,
        lat: typeof ev.lat === "number" ? ev.lat : 46.8508,
        lng: typeof ev.lng === "number" ? ev.lng : 9.5320,
        image: ev.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
        website: ev.website || "",
        ticketUrl: ev.ticketUrl || "",
        source: ev.source || "Social Media Query",
        originalSocialLink: ev.originalSocialLink || ""
      } as RegionalEvent;
    });

    // Extract citation URLs from grounding metadata to show where we scraped them
    const citationChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = citationChunks.map((chunk: any) => {
      const web = chunk?.web;
      return {
        title: web?.title || web?.uri || "Social Resource",
        uri: web?.uri || "#"
      };
    }).filter((src: any) => src.uri !== "#");

    // Add successfully parsed live scraped events to the active dataset
    if (events.length > 0) {
      localEvents = [...events, ...localEvents];
    }

    res.json({
      events,
      sources,
      summary: parsedResult.summary || `Erfolgreich ${events.length} Events aus der Websuche extrahiert.`
    });

  } catch (err: any) {
    console.error("Error during real-time Gemini scraping call:", err);
    
    // Check if error is related to quota or API issues
    const isQuotaExceeded = err.message?.includes("quota") || err.message?.includes("429") || err.message?.includes("LIMIT_EXHAUSTED") || err.message?.includes("RESOURCE_EXHAUSTED");
    
    // Seamless backend fallback to simulated events instead of returning a hard 500 error!
    console.log("Gemini API call returned rate limits check or quota error. Deploying emergency fallback generator.");
    
    const fallbackMocks = generateSimulatedEvents(targetLocation, searchKeywords, platform);
    
    // Append to local state store of the container so the user enjoys looking at them in the dashboard!
    localEvents = [...fallbackMocks, ...localEvents];
    
    res.json({
      events: fallbackMocks,
      sources: [
        { title: `Suche nach "${searchKeywords}" auf Facebook Events`, uri: "https://facebook.com" },
        { title: `Hashtag-Feed #${targetLocation}Events auf Instagram`, uri: "https://instagram.com" }
      ],
      summary: isQuotaExceeded 
        ? "⚠️ QUOTA EXCEEDED FALLBACK: Dein kostenloser Gemini API-Schlüssel hat sein Limit erreicht (Rate Limit / Quota-Überschreitung). Damit du deine App nahtlos weiter testen kannst, haben wir diese realistischen Events live simuliert."
        : `⚠️ SERVICE FALLBACK: Der Live-Scraper hat einen API-Fehler gemeldet (${err.message || "429 Rate-Limit"}). Wir haben stattdessen eine automatische Simulation für "${targetLocation}" geladen.`
    });
  }
});

// Configure Vite middleware mapping / Static Assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    // Production statics
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static files server configured.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ChurEvents server listening and scanning on port ${PORT}`);
  });
}

startServer();
