import { useState, useEffect } from "react";
import { 
  PlusCircle, Download, Check, Trash2, Edit3, X, Sparkles, 
  MapPin, Calendar, Clock, Archive, Globe, CheckCircle, 
  Eye, EyeOff, FileText, AlertTriangle, RefreshCw, Heart, 
  Link as LinkIcon, Image as ImageIcon, History, Layers
} from "lucide-react";
import { RegionalEvent, ScrapingResult, ScrapingRequest } from "./types";
import ScraperPanel from "./components/ScraperPanel";

// Standard ISO-8601 Date representation context (from user request runtime date)
const CURRENT_DATE_ISO = "2026-05-24";

interface CuratorEvent extends RegionalEvent {
  skipped?: boolean;
}

interface ScrapeHistoryEntry {
  id: string;
  timestamp: string;
  query: string;
  location: string;
  sourcePlatform: string;
  eventCount: number;
}

// Helper to normalize dates to strict YYYY-MM-DD format
function normalizeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
    return cleanStr;
  }
  
  const dmyRegex = /(\d{1,2})\.(\d{1,2})\.(\d{4})/;
  const dmyMatch = cleanStr.match(dmyRegex);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  const months: Record<string, string> = {
    januar: "01", jan: "01",
    februar: "02", feb: "02",
    märz: "03", maerz: "03", mrz: "03",
    april: "04", apr: "04",
    mai: "05",
    juni: "06", jun: "06",
    juli: "07", jul: "07",
    august: "08", aug: "08",
    september: "09", sept: "09", sep: "09",
    oktober: "10", okt: "10",
    november: "11", nov: "11",
    dezember: "12", dez: "12"
  };
  
  const wordMatch = cleanStr.match(/(\d{1,2})\.\s*([a-zA-ZäöüÄÖÜß]+)/i);
  if (wordMatch) {
    const day = wordMatch[1].padStart(2, '0');
    const monthName = wordMatch[2].toLowerCase();
    const month = months[monthName];
    if (month) {
      const yearMatch = cleanStr.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "2026";
      return `${year}-${month}-${day}`;
    }
  }

  try {
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (year >= 2024 && year <= 2030) {
        return `${year}-${month}-${day}`;
      }
    }
  } catch (e) {
    // ignore
  }
  
  return null;
}

// Helper to normalize the event category strictly mapping to: music, stage, markets, family, sport
function normalizeCategory(cat: string | undefined | null): "music" | "stage" | "markets" | "family" | "sport" {
  if (!cat) return "music";
  const c = cat.toLowerCase().trim();
  if (c === "music" || c === "musik" || c === "konzerte" || c === "party" || c === "festivals" || c === "dj-sets") return "music";
  if (c === "stage" || c === "bühne" || c === "buehne" || c === "kunst" || c === "theater" || c === "lesungen" || c === "kino" || c === "comedy") return "stage";
  if (c === "markets" || c === "markt" || c === "märkte" || c === "maerkte" || c === "flohmärkte" || c === "flohmaerkte" || c === "messen" || c === "brockenstuben") return "markets";
  if (c === "family" || c === "familie" || c === "kinderprogramm" || c === "workshops" || c === "brauchtum" || c === "familienfeste") return "family";
  if (c === "sport" || c === "sportveranstaltungen" || c === "turniere" || c === "läufe" || c === "wanderungen") return "sport";
  
  if (/konzert|party|dj|musik|festival|club/i.test(c)) return "music";
  if (/theater|lesung|comedy|kunst|kino|film/i.test(c)) return "stage";
  if (/markt|flohmarkt|messe|brockenstube/i.test(c)) return "markets";
  if (/kinder|familie|kids|workshop|basteln/i.test(c)) return "family";
  if (/sport|bike|lauf|rennen|turnier|trail|wander/i.test(c)) return "sport";

  return "music";
}

// Helper to resolve platform and url cleanly
function resolveSocialPlatformAndUrl(event: RegionalEvent): { sourcePlatform: "Facebook" | "Instagram" | "TikTok" | "Guidle" | "Other"; sourceUrl: string } {
  const src = (event.source || "Other").toLowerCase();
  const link = event.originalSocialLink || "";
  
  let sourcePlatform: "Facebook" | "Instagram" | "TikTok" | "Guidle" | "Other" = "Other";
  
  if (src.includes("facebook") || link.includes("facebook.com") || link.includes("fb.me") || link.includes("fb.com")) {
    sourcePlatform = "Facebook";
  } else if (src.includes("instagram") || link.includes("instagram.com") || link.includes("insta")) {
    sourcePlatform = "Instagram";
  } else if (src.includes("tiktok") || link.includes("tiktok.com")) {
    sourcePlatform = "TikTok";
  } else if (src.includes("guidle") || link.includes("guidle.")) {
    sourcePlatform = "Guidle";
  } else {
    sourcePlatform = "Other";
  }

  let sourceUrl = link.trim();
  if (!sourceUrl || !sourceUrl.startsWith("http")) {
    if (sourcePlatform === "Facebook") {
      sourceUrl = "https://www.facebook.com/events";
    } else if (sourcePlatform === "Instagram") {
      sourceUrl = "https://www.instagram.com";
    } else if (sourcePlatform === "TikTok") {
      sourceUrl = "https://www.tiktok.com";
    } else if (sourcePlatform === "Guidle") {
      sourceUrl = "https://www.guidle.com";
    } else {
      sourceUrl = "https://www.chur.ch";
    }
  }

  return { sourcePlatform, sourceUrl };
}

export default function App() {
  const [events, setEvents] = useState<CuratorEvent[]>([]);
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  
  // Track currently edited event inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CuratorEvent>>({});

  // Loaded and initialized saved events on mount
  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        // Default skipped: false to all loaded events
        const mapped = data.map((ev: RegionalEvent) => ({ ...ev, skipped: false }));
        setEvents(mapped);
      }
    } catch (err) {
      console.error("Fehler beim Laden:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
    
    // Load last 10 scraping history entries
    const savedHist = localStorage.getItem("chur_scraper_history");
    if (savedHist) {
      setHistory(JSON.parse(savedHist));
    }
  }, []);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Switch Keep/Skip Toggle
  const toggleSkipEvent = (id: string) => {
    setEvents(prev => prev.map(ev => {
      if (ev.id === id) {
        const nextState = !ev.skipped;
        triggerNotification(nextState ? "Event für Export ausgeblendet (Skip)" : "Event wiederhergestellt (Behalten) ✅");
        return { ...ev, skipped: nextState };
      }
      return ev;
    }));
  };

  // Keep all or Skip all shortcuts
  const markAllEvents = (skippedState: boolean) => {
    setEvents(prev => prev.map(ev => ({ ...ev, skipped: skippedState })));
    triggerNotification(skippedState ? "Alle Events auf 'Überspringen' gesetzt." : "Alle Events wurden wieder aktiv geschaltet! 👍");
  };

  // Inline Edit Trigger
  const startEditing = (ev: CuratorEvent) => {
    setEditingId(ev.id);
    setEditForm({ ...ev });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEditing = () => {
    if (!editForm.title?.trim()) {
      alert("Ein Event-Titel ist erforderlich.");
      return;
    }
    setEvents(prev => prev.map(ev => {
      if (ev.id === editingId) {
        return { ...ev, ...editForm } as CuratorEvent;
      }
      return ev;
    }));
    triggerNotification("Änderungen lokal für Export übernommen! 📝");
    setEditingId(null);
    setEditForm({});
  };

  const deleteFromList = async (id: string) => {
    if (window.confirm("Dieses Event aus der Kurationsliste entfernen?")) {
      try {
        const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
        if (res.ok) {
          setEvents(prev => prev.filter(ev => ev.id !== id));
          triggerNotification("Event dauerhaft entfernt. 🗑️");
        } else {
          triggerNotification("Fehler beim Löschen auf dem Server.");
        }
      } catch (err) {
        console.error("Fehler beim Löschen:", err);
        setEvents(prev => prev.filter(ev => ev.id !== id)); // fallback
      }
    }
  };

  const clearWorkbench = async () => {
    if (window.confirm("Möchtest du wirklich alle Events aus der Kurationsliste löschen?")) {
      try {
        const res = await fetch("/api/events/clear", { method: "POST" });
        if (res.ok) {
          setEvents([]);
          triggerNotification("Kurationsliste geleert! 🗑️");
        }
      } catch (err) {
        console.error("Fehler beim Leeren:", err);
      }
    }
  };

  const handleLoadSeeds = async () => {
    try {
      const res = await fetch("/api/events/seed", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const mapped = data.events.map((ev: RegionalEvent) => ({ ...ev, skipped: false }));
        setEvents(mapped);
        triggerNotification("6 Beispieldaten geladen! 🚀");
      }
    } catch (err) {
      console.error("Fehler beim Laden der Seeds:", err);
    }
  };

  // Connection scraper successes and updating verification list
  const handleScrapeSuccess = (result: ScrapingResult, req: ScrapingRequest) => {
    if (result.events && result.events.length > 0) {
      const newEventsMapped = result.events.map(ev => ({ ...ev, skipped: false }));
      
      // Update states
      setEvents(prev => {
        // filter out existing identically titled ones in this UI session to prevent instant cluttering
        const filteredNew = newEventsMapped.filter(ne => !prev.some(p => p.title.toLowerCase().trim() === ne.title.toLowerCase().trim()));
        return [...filteredNew, ...prev];
      });

      // Save history log entry
      const newEntry: ScrapeHistoryEntry = {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString("de-CH", { hour: '2-digit', minute: '2-digit' }),
        query: req.query,
        location: req.location,
        sourcePlatform: req.sourcePlatform || "all",
        eventCount: result.events.length
      };

      setHistory(prev => {
        const updated = [newEntry, ...prev].slice(0, 10);
        localStorage.setItem("chur_scraper_history", JSON.stringify(updated));
        return updated;
      });

      triggerNotification(`🚀 Erfolgreich ${result.events.length} Events live geparscht & kuratiert!`);
    } else {
      triggerNotification("Suchscan fertiggestellt, aber keine neuen Events gefunden.");
    }
  };

  // Clears scraping runs history list from local storage
  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("chur_scraper_history");
    triggerNotification("Verlauf gelöscht.");
  };

  // Highly compliant Export handler
  const handleExportJSON = () => {
    // Only exports non-skipped events
    const validFiltered = events.filter(ev => ev.skipped !== true);
    
    if (validFiltered.length === 0) {
      triggerNotification("⚠️ Es gibt keine aktiv behaltenen Events zum Exportieren.");
      return;
    }

    const exportedList: any[] = [];
    const seenKeys = new Set<string>();

    for (const ev of validFiltered) {
      // 1. Normalize and validate date
      const normDate = normalizeDate(ev.date);
      if (!normDate) continue; // Skip events without a clear valid date

      // 2. Filter out past events
      if (normDate < CURRENT_DATE_ISO) {
        continue;
      }

      // 3. Filter out church services, masses, regular courses
      const titleLower = ev.title.toLowerCase();
      const descLower = ev.description.toLowerCase();
      
      const isExcluded = 
        titleLower.includes("gottesdienst") || descLower.includes("gottesdienst") ||
        titleLower.includes("andacht") || descLower.includes("andacht") ||
        titleLower.includes("gottesdienste") || descLower.includes("gottesdienste") ||
        titleLower.includes("heilige messe") || descLower.includes("heilige messe") ||
        titleLower.includes("wortgottesfeier") || descLower.includes("wortgottesfeier") ||
        titleLower.includes("eucharistie") || descLower.includes("eucharistie") ||
        titleLower.includes("liturgie") || descLower.includes("liturgie") ||
        titleLower.includes("regelmässig") || descLower.includes("regelmässig") ||
        titleLower.includes("regelmässige") || descLower.includes("regelmässige") ||
        titleLower.includes("regelmässiger") || descLower.includes("regelmässiger") ||
        titleLower.includes("regelmassig") || descLower.includes("regelmassig") ||
        titleLower.includes("wöchentlich") || descLower.includes("wöchentlich") ||
        titleLower.includes("wochentlich") || descLower.includes("wochentlich") ||
        titleLower.includes("jeden montag") || descLower.includes("jeden montag") ||
        titleLower.includes("jeden dienstag") || descLower.includes("jeden dienstag") ||
        titleLower.includes("jeden mittwoch") || descLower.includes("jeden mittwoch") ||
        titleLower.includes("jeden donnerstag") || descLower.includes("jeden donnerstag") ||
        titleLower.includes("jeden freitag") || descLower.includes("jeden freitag") ||
        titleLower.includes("jeden samstag") || descLower.includes("jeden samstag") ||
        titleLower.includes("jeden sonntag") || descLower.includes("jeden sonntag") ||
        titleLower.includes("täglich") || descLower.includes("täglich") ||
        titleLower.includes("taglich") || descLower.includes("taglich") ||
        titleLower.includes("gottesdienstes") || descLower.includes("gottesdienstes") ||
        (titleLower.includes("kurs") && !titleLower.includes("exkursion") && !titleLower.includes("parcour") && !titleLower.includes("parcours")) ||
        (descLower.includes("kurs") && !descLower.includes("exkursion") && !descLower.includes("parcour") && !descLower.includes("parcours") && descLower.includes("fortlaufend"));
        
      if (isExcluded) {
        continue;
      }

      // 4. Validate and map municipality
      const ALLOWED_MUNICIPALITIES = [
        "Chur", "Domat/Ems", "Felsberg", "Haldenstein", "Trimmis", "Untervaz", "Zizers", 
        "Tamins", "Churwalden", "Tschiertschen-Praden", "Bonaduz", "Rhäzüns", "Malans", 
        "Landquart", "Thusis"
      ];
      const correctMun = ALLOWED_MUNICIPALITIES.find(
        m => m.toLowerCase() === (ev.municipality || "").toLowerCase().trim()
      );
      if (!correctMun) {
        continue; // Skip if municipality is not in the specified list
      }

      // 5. Remove duplicates (same title + date + municipality)
      const dupKey = `${ev.title.toLowerCase().trim()}_${normDate}_${correctMun.toLowerCase()}`;
      if (seenKeys.has(dupKey)) {
        continue;
      }
      seenKeys.add(dupKey);

      // 6. Normalize category
      const normCat = normalizeCategory(ev.category) || "music";

      // 7. Resolve platform info
      const resolved = resolveSocialPlatformAndUrl(ev);

      // 8. Build final compliant event structure
      const compliantEvent: any = {
        title: ev.title.trim(),
        date: normDate,
        municipality: correctMun,
        locationName: ev.locationName ? ev.locationName.trim() : `${correctMun}, Schweiz`,
        category: normCat,
        description: ev.description ? ev.description.trim() : `${ev.title} in ${correctMun}.`,
        sourceUrl: resolved.sourceUrl,
        sourcePlatform: resolved.sourcePlatform,
      };

      if (ev.time) compliantEvent.time = ev.time.trim();
      if (ev.image) compliantEvent.imageUrl = ev.image.trim();
      if (typeof ev.lat === 'number' && !isNaN(ev.lat)) compliantEvent.lat = ev.lat;
      if (typeof ev.lng === 'number' && !isNaN(ev.lng)) compliantEvent.lng = ev.lng;
      if (ev.ticketUrl) compliantEvent.ticketUrl = ev.ticketUrl.trim();
      if (ev.website) compliantEvent.organizerUrl = ev.website.trim();

      exportedList.push(compliantEvent);
    }

    if (exportedList.length === 0) {
      triggerNotification("⚠️ Keine konformen zukünftigen Events für den Export gefunden.");
      return;
    }

    const jsonString = JSON.stringify(exportedList, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    
    link.download = `chur-events-export-${CURRENT_DATE_ISO}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    triggerNotification(`📥 ${exportedList.length} konforme Events heruntergeladen!`);
  };

  // Counts of current list
  const activeCount = events.filter(e => !e.skipped).length;
  const skippedCount = events.filter(e => e.skipped).length;

  return (
    <div className="min-h-screen bg-[#0b1329] text-slate-100 flex flex-col justify-between selection:bg-sky-500 selection:text-white">
      {/* Floating active status notification */}
      {notification && (
        <div className="fixed top-6 right-6 max-w-sm bg-slate-900 border border-slate-700 text-white px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center space-x-3 text-xs md:text-sm animate-bounce">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="font-semibold">{notification}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Admin Panel Header navigation */}
      <header className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 z-50 px-6 py-4.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-sky-500/10">
              <Layers className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black tracking-tight text-white font-sans">
                  ChurEvents <span className="text-sky-400 font-medium text-base ml-1">Event-Kurator</span>
                </h1>
                <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-bold uppercase tracking-wider rounded border border-sky-500/20">
                  Admin Tool
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Extraktions-, Filter- & Export-Kommandozentrale</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportJSON}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98] text-white rounded-xl text-xs md:text-sm font-bold transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-emerald-500/10"
              title="Gepflegte Eventdaten als JSON herunterladen"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Als JSON exportieren ({activeCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Core Work Area */}
      <main className="max-w-7xl mx-auto w-full px-4 md:px-6 py-6 flex-1 space-y-8">
        
        {/* Scraper controls and verification pipeline */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <div className="lg:col-span-8 space-y-6">
            <ScraperPanel onScrapeSuccess={handleScrapeSuccess} />
          </div>

          {/* History Sidebar */}
          <div className="lg:col-span-4 bg-slate-800/40 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                <History className="w-4 h-4 text-sky-400" />
                <span>Letzte Scrape-Läufe</span>
              </h3>
              {history.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Verlauf löschen
                </button>
              )}
            </div>

            {history.length > 0 ? (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {history.map((h) => (
                  <div key={h.id} className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/40 hover:border-slate-700 transition-all text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200">"{h.query}"</span>
                      <span className="text-[10px] text-slate-500">{h.timestamp}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400 text-[10px]">
                      <span>📍 {h.location} • {h.sourcePlatform === 'all' ? "Alle Kanäle" : h.sourcePlatform.toUpperCase()}</span>
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 font-semibold rounded shrink-0">
                        {h.eventCount} Events
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs text-medium">
                Noch keine historischen Scrape-Läufe verzeichnet.
              </div>
            )}
          </div>
        </section>

        {/* Curator Workboard List */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center space-x-2.5">
                <FileText className="w-5 h-5 text-sky-400" />
                <span>Event-Kurationsliste und Qualitätssicherung</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Korrigiere Fehler direkt inline und wähle, welche Einträge im endgültigen Export-Datenbestand behalten werden.
              </p>
            </div>

            {/* List level controls */}
            {events.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => markAllEvents(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                >
                  Alle beibehalten
                </button>
                <button
                  onClick={() => markAllEvents(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded-lg text-xs font-semibold transition-colors"
                >
                  Alle ignorieren
                </button>
                <button
                  onClick={clearWorkbench}
                  className="px-3 py-1.5 bg-red-955/40 hover:bg-red-900/40 text-rose-400 hover:text-rose-300 rounded-lg text-xs font-semibold transition-colors border border-red-900/30 flex items-center space-x-1"
                  title="Ganze Kurationsliste leeren"
                >
                  <span>Liste leeren 🗑️</span>
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-900/50 rounded-2xl">
            {events.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
                {events.map((event) => {
                  const isEditing = editingId === event.id;
                  const { sourcePlatform, sourceUrl } = resolveSocialPlatformAndUrl(event);
                  const parsedDate = normalizeDate(event.date);
                  const isPast = parsedDate ? parsedDate < CURRENT_DATE_ISO : false;

                  return (
                    <div 
                      key={event.id}
                      className={`relative bg-slate-800/40 rounded-2xl border transition-all duration-300 overflow-hidden flex flex-col justify-between ${
                        event.skipped 
                          ? "opacity-50 border-slate-800 saturate-50" 
                          : isPast
                            ? "border-amber-500/30 shadow-amber-500/5"
                            : "border-slate-800 hover:border-slate-700 hover:shadow-xl"
                      }`}
                    >
                      {/* Past date info badge overlay */}
                      {isPast && !event.skipped && (
                        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-[10px] text-amber-400 font-semibold flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                          <span>Event liegt in der Vergangenheit ({event.date}) und wird beim Export automatisch übersprungen.</span>
                        </div>
                      )}

                      {isEditing ? (
                        /* Inline Form Editing Panel */
                        <div className="p-5 space-y-4 text-xs">
                          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                            <span className="font-bold text-sky-400 text-sm uppercase">Event bearbeiten</span>
                            <span className="text-[10px] text-slate-500">Formular-Korrektur</span>
                          </div>

                          <div className="space-y-2.5">
                            <div>
                              <label className="text-slate-400 block mb-1">Titel</label>
                              <input 
                                type="text"
                                value={editForm.title || ""}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-slate-400 block mb-1">Datum (YYYY-MM-DD)</label>
                                <input 
                                  type="text"
                                  value={editForm.date || ""}
                                  placeholder="z.B. 2026-06-15"
                                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-slate-400 block mb-1">Uhrzeit / Zeitspanne</label>
                                <input 
                                  type="text"
                                  value={editForm.time || ""}
                                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-slate-400 block mb-1">Ort (Gemeinde)</label>
                                <select 
                                  value={editForm.municipality || ""}
                                  onChange={(e) => setEditForm({ ...editForm, municipality: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                >
                                  <option value="Chur">Chur</option>
                                  <option value="Domat/Ems">Domat/Ems</option>
                                  <option value="Felsberg">Felsberg</option>
                                  <option value="Haldenstein">Haldenstein</option>
                                  <option value="Trimmis">Trimmis</option>
                                  <option value="Untervaz">Untervaz</option>
                                  <option value="Zizers">Zizers</option>
                                  <option value="Tamins">Tamins</option>
                                  <option value="Churwalden">Churwalden</option>
                                  <option value="Tschiertschen-Praden">Tschiertschen-Praden</option>
                                  <option value="Bonaduz">Bonaduz</option>
                                  <option value="Rhäzüns">Rhäzüns</option>
                                  <option value="Malans">Malans</option>
                                  <option value="Landquart">Landquart</option>
                                  <option value="Thusis">Thusis</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-slate-400 block mb-1">Kategorie</label>
                                <select 
                                  value={editForm.category || "music"}
                                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value as any })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                >
                                  <option value="music">Musik & Party (music)</option>
                                  <option value="stage">Bühne & Kunst (stage)</option>
                                  <option value="markets">Märkte (markets)</option>
                                  <option value="family">Familie (family)</option>
                                  <option value="sport">Sport (sport)</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="text-slate-400 block mb-1">Konkreter Spielort / LocationName</label>
                              <input 
                                type="text"
                                value={editForm.locationName || ""}
                                onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-slate-400 block mb-1">Beschreibung (Kurzfassung)</label>
                              <textarea 
                                value={editForm.description || ""}
                                rows={2}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-slate-400 block mb-1">Quell-Link (Aus FB/Insta)</label>
                                <input 
                                  type="text"
                                  value={editForm.originalSocialLink || ""}
                                  onChange={(e) => setEditForm({ ...editForm, originalSocialLink: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-slate-400 block mb-1">Bild-URL</label>
                                <input 
                                  type="text"
                                  value={editForm.image || ""}
                                  onChange={(e) => setEditForm({ ...editForm, image: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-700/60">
                            <button
                              onClick={cancelEditing}
                              className="px-3.5 py-1.5 bg-slate-755 hover:bg-slate-700 text-slate-300 rounded-md font-semibold transition-colors"
                            >
                              Abbrechen
                            </button>
                            <button
                              onClick={saveEditing}
                              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-md font-bold transition-colors"
                            >
                              Speichern
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Default Curated Card Layout */
                        <div className="flex flex-col flex-1">
                          {/* Image preview section with metadata overlay */}
                          <div className="h-40 w-full relative bg-slate-900 overflow-hidden shrink-0">
                            <img 
                              src={event.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=400&q=80"}
                              alt={event.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover opacity-60 hover:opacity-85 transition-opacity duration-300"
                            />
                            
                            {/* Keep/Skip Toggle Overlay */}
                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                              <button
                                onClick={() => toggleSkipEvent(event.id)}
                                className={`px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide rounded-lg border flex items-center space-x-1 transition-all shadow-md backdrop-blur-md ${
                                  event.skipped
                                    ? "bg-slate-900/90 border-slate-700 text-slate-450 hover:text-white"
                                    : "bg-emerald-500/95 border-emerald-400 text-white hover:bg-emerald-600"
                                }`}
                              >
                                {event.skipped ? (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5" />
                                    <span>Ignoriert</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Aktiv</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Standardized category badge bottom left */}
                            <span className="absolute bottom-3 left-3 px-2 py-0.5 bg-slate-950/80 backdrop-blur-md text-sky-450 border border-slate-800 text-[10px] font-bold uppercase tracking-wider rounded">
                              {event.category}
                            </span>

                            {/* Social Media origin tag bottom-right */}
                            <span className="absolute bottom-3 right-3 text-[10px] font-semibold text-slate-350 bg-slate-950/70 py-0.5 px-2 rounded backdrop-blur-sm">
                              ID: {event.id.slice(0, 10)}...
                            </span>
                          </div>

                          <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                            <div className="space-y-2">
                              {/* Title */}
                              <h4 className="font-extrabold text-slate-100 font-sans text-base leading-tight break-words">
                                {event.title}
                              </h4>

                              {/* Timestamps status */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-medium">
                                <span className="flex items-center space-x-1">
                                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                                  <span className={isPast ? "text-amber-400 line-through" : ""}>{event.date}</span>
                                </span>
                                {event.time && (
                                  <span className="flex items-center space-x-1">
                                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                                    <span>{event.time}</span>
                                  </span>
                                )}
                              </div>

                              {/* Municipality Tag */}
                              <div className="inline-flex items-center space-x-1 py-1 px-1.5 bg-slate-800/80 rounded border border-slate-700/60 text-xs">
                                <MapPin className="w-3 h-3 text-rose-500" />
                                <span className="font-bold text-slate-300">{event.municipality}</span>
                                <span className="text-slate-550 shrink-0">•</span>
                                <span className="text-slate-400 truncate max-w-[140px]">{event.locationName}</span>
                              </div>

                              {/* Description body */}
                              <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-3">
                                {event.description}
                              </p>
                            </div>

                            {/* Actions footer */}
                            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                              <div className="text-[10px] text-slate-500 font-bold uppercase">
                                Quelle: <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 font-extrabold hover:underline">{sourcePlatform}</a>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => startEditing(event)}
                                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-all"
                                  title="Dieses Event bearbeiten"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteFromList(event.id)}
                                  className="p-2 bg-slate-800 hover:bg-slate-705 text-slate-450 hover:text-rose-450 rounded-lg transition-all"
                                  title="Aus Liste entfernen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-850 rounded-3xl p-12 border border-slate-800/80 text-center flex flex-col items-center justify-center space-y-4">
                <div className="p-4 bg-slate-800 text-slate-600 rounded-full">
                  <Archive className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-200 font-sans">Kurationsliste zurzeit leer</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                    Der Scraper hat im Moment keine aktiven Events geladen. Trage oben Suchbegriffe (z.B. „Festivals und Live-Konzerte“) ein und starte einen Scan! Die Resultate erscheinen umgehend zur Bearbeitung hier.
                  </p>
                </div>
                <button
                  onClick={handleLoadSeeds}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-350 text-xs font-semibold rounded-lg transition-colors border border-slate-700/60"
                >
                  Beispieldaten laden 🚀
                </button>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Admin Panel Footer footer */}
      <footer className="bg-slate-950 text-slate-500 py-6 border-t border-slate-900 text-center text-[10px] md:text-xs">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>&copy; 2026 ChurEvents Scraper Console. Internes Administrations- und Curationstool der Ostschweiz.</p>
          <p className="flex items-center space-x-1 text-slate-600">
            <span>Sollte die Gemini API ausgelastet sein, schaltet der Server autark auf eine kühne high-fidelity Echtzeitsimulation um.</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
