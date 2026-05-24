import { useState, FormEvent } from "react";
import { Search, MapPin, Sparkles, AlertCircle, Share2, Globe, ExternalLink, Loader2 } from "lucide-react";
import { ScrapingResult, ScrapingRequest } from "../types";

interface ScraperPanelProps {
  onScrapeSuccess: (result: ScrapingResult, req: ScrapingRequest) => void;
}

export default function ScraperPanel({ onScrapeSuccess }: ScraperPanelProps) {
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<ScrapingRequest>({
    query: "Festivals und Live-Konzerte",
    location: "Chur",
    sourcePlatform: "all",
  });
  
  const [result, setResult] = useState<ScrapingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScrape = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const resp = await fetch("/api/events/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!resp.ok) {
        throw new Error("Fehler beim Social Media Queries.");
      }

      const data: ScrapingResult = await resp.json();
      setResult(data);
      onScrapeSuccess(data, params);
    } catch (err: any) {
      setError(err.message || "Unerwarteter Fehler beim Scraping");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-800 relative overflow-hidden">
      {/* Visual neon background accents */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white font-display">Social-Media & Web Scraper</h2>
            <p className="text-xs text-slate-400">Extrahiere Events live mittels KI & Google Search Grounding</p>
          </div>
        </div>

        <div className="bg-slate-800/60 rounded-2xl p-4 mb-6 border border-slate-700/50 text-xs md:text-sm text-slate-300 leading-relaxed">
          <p className="font-semibold text-sky-400 mb-1">💡 Wie funktioniert das?</p>
          Social-Media-Seiten sperren traditionelle Scraper rasch per Captcha. Unsere Lösung nutzt die 
          <strong className="text-white"> Gemini Websuche (Search Grounding)</strong>. Sie durchsucht kontinuierlich öffentliche Beiträge, 
          Hashtags, Ortsseiten und Veranstaltungskalender in Echtzeit und bereitet diese als strukturierte Daten auf.
        </div>

        <form onSubmit={handleScrape} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Keywords input */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Suchbegriffe (Stichworte)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={params.query}
                  onChange={(e) => setParams({ ...params, query: e.target.value })}
                  placeholder="z.B. Strassenkunst, Elektro, Konzert"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
            </div>

            {/* Location select input */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium font-sans">Ziel-Stadt / Region</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={params.location}
                  onChange={(e) => setParams({ ...params, location: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none"
                >
                  <option value="Chur">Chur</option>
                  <option value="Landquart">Landquart</option>
                  <option value="Thusis">Thusis</option>
                  <option value="Churwalden">Churwalden</option>
                  <option value="Domat/Ems">Domat/Ems</option>
                  <option value="Felsberg">Felsberg</option>
                  <option value="Bonaduz">Bonaduz</option>
                  <option value="Malans">Malans</option>
                </select>
              </div>
            </div>

            {/* Platform Select */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Scraping-Pipeline</label>
              <div className="relative">
                <Share2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={params.sourcePlatform}
                  onChange={(e) => setParams({ ...params, sourcePlatform: e.target.value as any })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none"
                >
                  <option value="all">Alle Quellen optimiert</option>
                  <option value="facebook">Facebook Events & Groups</option>
                  <option value="instagram">Instagram Hashtags/Feeds</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-semibold text-sm rounded-xl transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-sky-500/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none w-full md:w-auto justify-center`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Durchsuche Social-Media-Kanäle...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Jetzt scannen & scrapen</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Display Error if any */}
        {error && (
          <div className="mt-6 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-4 flex items-start space-x-3 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold">Fehler beim Scannen</p>
              <p className="text-xs text-rose-300/90">{error}</p>
            </div>
          </div>
        )}

        {/* Display Results details */}
        {result && (
          <div className="mt-6 space-y-4 border-t border-slate-800 pt-6 animate-fadeIn">
            <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Scrape erfolgreich abgeschlossen! {result.events.length} Events importiert</span>
            </div>

            {/* Simulation feedback / API warning */}
            {result.summary && (
              <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700 text-xs text-slate-300">
                <p className="font-semibold text-sky-400 mb-1 flex items-center space-x-1">
                  <Globe className="w-3.5 h-3.5 inline" />
                  <span>Auswertung & Herkunftsnachweis</span>
                </p>
                <p className="leading-relaxed">{result.summary}</p>
              </div>
            )}

            {/* List and citations derived from Search Grounding */}
            {result.sources && result.sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Verifizierte Quellennachweise (Citations):</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {result.sources.map((src, idx) => (
                    <a
                      key={idx}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 bg-slate-800 hover:bg-slate-755 rounded-lg border border-slate-700/60 text-xs text-slate-200 transition-all duration-200 group"
                    >
                      <span className="truncate max-w-[85%] font-medium group-hover:text-sky-400">{src.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
