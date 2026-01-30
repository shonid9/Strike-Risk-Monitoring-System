import { BaseConnector } from "./base";
import { SignalEnvelope } from "../../shared/types";
import axios from "axios";

export class NewsConnector extends BaseConnector {
  private lastUpdate = 0;
  private articleHistory: number[] = [];
  private toneHistory: number[] = [];
  private apiKey = process.env.NEWSAPI_KEY || "36ba3c3b-7bad-4193-8d30-1054ae9acc26";
  private baseUrl = "https://eventregistry.org/api/v1/article/getArticles";
  private rssCache: { fetchedAt: number; items: any[]; sources: string[] } | null = null;
  private rssCacheTtlMs = 30 * 60 * 1000; // 30 minutes
  private rssFeeds: Array<{ name: string; url: string }> = [
    { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
    { name: "Reuters", url: "https://feeds.reuters.com/reuters/worldNews" },
    { name: "AP", url: "https://apnews.com/apf-topnews?output=rss" },
    { name: "CNN", url: "https://rss.cnn.com/rss/edition_world.rss" },
  ];

  async fetchSignals(): Promise<SignalEnvelope[]> {
    const now = Date.now();
    
    // Try to fetch real news data from NewsAPI.ai (Event Registry)
    try {
      // Search for Iran-related news with strike/attack keywords
      // NewsAPI.ai uses Event Registry API format
      // Search for Iran AND (strike OR attack OR military OR nuclear)
      const response = await axios.post(this.baseUrl, {
        action: "getArticles",
        keyword: "Iran AND (strike OR attack OR military OR nuclear OR imminent)",
        keywordOper: "and",
        conceptUri: [],
        categoryUri: [],
        sourceUri: [],
        authorUri: [],
        lang: "eng",
        dateStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 24 hours
        dateEnd: new Date().toISOString().split('T')[0],
        articlesSortBy: "date",
        articlesCount: 50, // Get more articles to filter
        articlesPage: 1,
        articlesArticleBodyLen: 500, // Get first 500 chars of body for analysis
        resultType: "articles",
        apiKey: this.apiKey,
        dataType: ["news", "blog"]
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      // Event Registry returns articles in response.articles.results
      const articlesData = response.data?.articles?.results || response.data?.articles || [];
      const articles = Array.isArray(articlesData) ? articlesData : [];
      
      // Filter ONLY Iran-US-Israel related military/strike articles
      const matchedArticles = articles.filter((article: any) => {
        // Event Registry format: title, body, or text fields
        const text = `${article.title || ""} ${article.body || ""} ${article.text || ""}`.toLowerCase();
        
        // MUST contain Iran
        const hasIran = text.includes("iran") || text.includes("iranian") || text.includes("tehran");
        if (!hasIran) return false;
        
        // MUST be about military/conflict with US/Israel OR strike/attack context
        const hasRelevantContext = 
          text.includes("us ") || text.includes("u.s.") || text.includes("united states") || text.includes("america") ||
          text.includes("israel") || text.includes("israeli") ||
          text.includes("strike") || text.includes("attack") || 
          text.includes("military action") || text.includes("imminent") ||
          text.includes("nuclear") || text.includes("bombing") || text.includes("raid");
        
        return hasRelevantContext;
      });

      const matchedCount = matchedArticles.length;
      
      // Calculate urgency tone based on keywords and recency
      let urgentCount = 0;
      const nowTime = Date.now();
      matchedArticles.forEach((article: any) => {
        // Event Registry format: date or dateTime
        const publishedAt = article.dateTime ? new Date(article.dateTime).getTime() : 
                           article.date ? new Date(article.date).getTime() : nowTime;
        const hoursAgo = (nowTime - publishedAt) / (1000 * 60 * 60);
        
        // More urgent if recent and contains urgent keywords
        const text = `${article.title || ""} ${article.body || ""} ${article.text || ""}`.toLowerCase();
        if (text.includes("imminent") || text.includes("immediate") || text.includes("urgent")) {
          urgentCount += hoursAgo < 6 ? 2 : 1; // Recent urgent articles count more
        } else if (hoursAgo < 12) {
          urgentCount += 0.5; // Recent articles get partial credit
        }
      });
      
      const imminentTone = Math.min(1, urgentCount / Math.max(1, matchedCount));
      
      // Extract unique sources (Event Registry format: source.title or source.name)
      const eventRegistrySources = [...new Set(matchedArticles.map((a: any) => 
        a.source?.title || a.source?.name || a.source?.uri?.split('/').pop() || "Unknown"
      ))];

      // Fetch RSS articles for additional sources
      const rssResult = await this.fetchRssArticles();
      const rssMatched = this.filterRssArticles(rssResult.items);
      const rssMatchedCount = rssMatched.length;
      const combinedCount = matchedCount + rssMatchedCount;
      
      // Track history for trend analysis
      this.articleHistory.push(matchedCount);
      this.toneHistory.push(imminentTone);
      if (this.articleHistory.length > 10) {
        this.articleHistory.shift();
        this.toneHistory.shift();
      }
      
      // Calculate trend
      const articleTrend = this.articleHistory.length > 1 
        ? this.articleHistory[this.articleHistory.length - 1] - this.articleHistory[0]
        : 0;
      const toneTrend = this.toneHistory.length > 1
        ? this.toneHistory[this.toneHistory.length - 1] - this.toneHistory[0]
        : 0;
      
      // Confidence based on consistency, volume, and data quality
      const avgArticles = this.articleHistory.length > 0 
        ? this.articleHistory.reduce((a, b) => a + b, 0) / this.articleHistory.length 
        : matchedCount;
      const consistency = this.articleHistory.length > 1
        ? 1 - Math.min(1, this.articleHistory.reduce((sum, val) => sum + Math.abs(val - avgArticles), 0) / this.articleHistory.length / Math.max(avgArticles, 1))
        : 0.5;
      // Higher confidence with more articles, consistent data, and real API data
      const confidence = Math.min(0.95, 
        0.5 + // Base confidence for real API data
        (matchedCount / 15) * 0.2 + // More articles = higher confidence
        consistency * 0.15 + // Consistency matters
        (imminentTone > 0.3 ? 0.1 : 0) // Urgent tone adds confidence
      );
      
      // Intensity combines volume and urgency with explicit thresholds based on actual data
      // Risk logic: 0 articles = 0, 3-5 articles = low, 10+ with alert keywords = high
      const countScore =
        combinedCount === 0 ? 0 :
        combinedCount <= 2 ? 0.05 :
        combinedCount <= 5 ? 0.15 :
        combinedCount <= 9 ? 0.3 :
        combinedCount <= 14 ? 0.5 :
        combinedCount <= 24 ? 0.7 : 0.9;
      const urgencyBoost = Math.min(0.2, imminentTone * 0.2); // up to +0.2
      const intensity = Math.min(1, Math.max(0, countScore + urgencyBoost)); // No artificial minimum
      
      // Generate summary
      const summary = combinedCount > 0
        ? `${combinedCount} articles (EventRegistry ${matchedCount}, RSS ${rssMatchedCount}); ${Math.round(imminentTone * 100)}% urgent tone${articleTrend > 0 ? " (↑)" : articleTrend < 0 ? " (↓)" : ""}`
        : "No significant strike-related coverage detected";
      
      console.log(`[NewsConnector] Real data: ${matchedCount} articles, ${(imminentTone * 100).toFixed(0)}% urgent tone`);
      
      const activeOutlets = [...new Set([...eventRegistrySources, ...rssResult.sources])];

      // Extract detailed article info for display (top 15 by recency)
      const detailedArticles = matchedArticles.slice(0, 15).map((article: any) => ({
        title: article.title || article.headline || "No title",
        date: article.dateTime || article.date || article.publishedAt || new Date().toISOString(),
        source: article.source?.title || article.source?.name || article.source?.uri?.split('/').pop() || "Unknown",
        url: article.url || article.uri || null,
        body: (article.body || article.text || "").substring(0, 200)
      }));

      // Add RSS articles details
      const detailedRssArticles = rssMatched.slice(0, 10).map((item: any) => ({
        title: item.title || "No title",
        date: item.pubDate || item.published || new Date().toISOString(),
        source: item.source || "RSS",
        url: item.link || null,
        body: (item.description || item.summary || "").substring(0, 200)
      }));

      const allDetailedArticles = [...detailedArticles, ...detailedRssArticles]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20); // Top 20 most recent

      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence,
          intensity,
          timestamp: now,
          summary,
          rawRef: { 
            matchedArticles: combinedCount,
            matchedEventRegistry: matchedCount,
            matchedRss: rssMatchedCount,
            imminentTone,
            countScore,
            urgencyBoost,
            articleTrend,
            toneTrend,
            activeOutlets,
            avgArticles: avgArticles.toFixed(1),
            totalArticles: articles.length,
            dataStatus: "live",
            dataSource: {
              eventRegistry: "ok",
              rss: "ok"
            },
            rssSources: rssResult.sources,
            rssUpdatedAt: rssResult.fetchedAt,
            rssFeeds: this.rssFeeds.map((f) => f.name),
            articles: allDetailedArticles // NEW: detailed article list
          },
        }),
      ];
    } catch (error: any) {
      // Do not simulate - try RSS only
      console.warn(`[NewsConnector] Event Registry failed, using RSS only:`, error.message);
      const rssResult = await this.fetchRssArticles();
      const rssMatched = this.filterRssArticles(rssResult.items);
      const rssMatchedCount = rssMatched.length;

      // Calculate intensity directly from data - no artificial baseline
      const calculatedIntensity = (rssMatchedCount / 12) * 0.6;
      const intensity = Math.min(1, Math.max(0, calculatedIntensity));

      // Extract RSS articles details
      const detailedRssArticles = rssMatched.slice(0, 20).map((item: any) => ({
        title: item.title || "No title",
        date: item.pubDate || item.published || new Date().toISOString(),
        source: item.source || "RSS",
        url: item.link || null,
        body: (item.description || item.summary || "").substring(0, 200)
      }));

      return [
        this.makeEnvelope({
          source: this.config.name,
          confidence: rssMatchedCount > 0 ? 0.5 : 0,
          intensity,
          timestamp: now,
          summary: rssMatchedCount > 0
            ? `${rssMatchedCount} RSS articles matched`
            : "No significant strike-related coverage detected (RSS)",
          rawRef: {
            matchedArticles: rssMatchedCount,
            matchedEventRegistry: 0,
            matchedRss: rssMatchedCount,
            imminentTone: 0,
            articleTrend: 0,
            toneTrend: 0,
            activeOutlets: rssResult.sources,
            avgArticles: rssMatchedCount.toFixed(1),
            totalArticles: rssResult.items.length,
            dataStatus: rssMatchedCount > 0 ? "live" : "unavailable",
            dataSource: {
              eventRegistry: "error",
              rss: rssMatchedCount > 0 ? "ok" : "empty"
            },
            rssSources: rssResult.sources,
            rssUpdatedAt: rssResult.fetchedAt,
            rssFeeds: this.rssFeeds.map((f) => f.name),
            error: error?.message || "Event Registry error",
            articles: detailedRssArticles // NEW: detailed article list
          },
        }),
      ];
    }
  }

  private async fetchRssArticles(): Promise<{ items: any[]; sources: string[]; fetchedAt: number }> {
    const now = Date.now();
    if (this.rssCache && now - this.rssCache.fetchedAt < this.rssCacheTtlMs) {
      return {
        items: this.rssCache.items,
        sources: this.rssCache.sources,
        fetchedAt: this.rssCache.fetchedAt,
      };
    }

    const results = await Promise.allSettled(
      this.rssFeeds.map(async (feed) => {
        const response = await axios.get(feed.url, { timeout: 8000 });
        return { name: feed.name, xml: response.data };
      })
    );

    const items: any[] = [];
    const sources: string[] = [];

    results.forEach((res) => {
      if (res.status === "fulfilled") {
        sources.push(res.value.name);
        items.push(...this.parseRssItems(res.value.xml, res.value.name));
      }
    });

    this.rssCache = { fetchedAt: now, items, sources };
    return { items, sources, fetchedAt: now };
  }

  private parseRssItems(xml: string, source: string): any[] {
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml))) {
      const block = match[1];
      const title = this.extractTag(block, "title");
      const description = this.extractTag(block, "description");
      const pubDate = this.extractTag(block, "pubDate");
      items.push({
        title,
        description,
        pubDate,
        source,
      });
    }
    return items;
  }

  private extractTag(block: string, tag: string): string {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = regex.exec(block);
    if (!match) return "";
    return match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  }

  private filterRssArticles(items: any[]): any[] {
    return items.filter((item) => {
      const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
      
      // MUST contain Iran
      const hasIran = text.includes("iran") || text.includes("iranian") || text.includes("tehran");
      if (!hasIran) return false;
      
      // MUST be about military/conflict with US/Israel OR strike/attack context
      const hasRelevantContext = 
        text.includes("us ") || text.includes("u.s.") || text.includes("united states") || text.includes("america") ||
        text.includes("israel") || text.includes("israeli") ||
        text.includes("strike") || text.includes("attack") || 
        text.includes("military") || text.includes("imminent") ||
        text.includes("nuclear") || text.includes("bombing") || text.includes("raid") ||
        text.includes("centcom") || text.includes("pentagon");
      
      return hasRelevantContext;
    });
  }

  // Simulation removed - all data must be real or unavailable
}
