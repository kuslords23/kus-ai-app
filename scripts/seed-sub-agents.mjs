#!/usr/bin/env node
/**
 * Seed ~10,000 kingdom sub-agents + departments into Supabase.
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-sub-agents.mjs
 */
import { createClient } from "@supabase/supabase-js";

const TARGET = 10_000;
const BATCH = 200;

const DEPARTMENTS = [
  { id: "sports", name: "Sports", description: "Scores, leagues, fantasy", icon: "⚽", priority: 95,
    topics: ["football","basketball","cricket","tennis","boxing","mma","rugby","athletics","olympics","world-cup","premier-league","la-liga","nba","nfl","dream-league","fantasy-sports","betting-odds","transfers","ghana-football","african-football","champions-league","coaching","sports-nutrition","injuries","referee-rules","youth-sports"] },
  { id: "marketing", name: "Marketing", description: "SEO, ads, branding", icon: "📣", priority: 88,
    topics: ["seo","sem","social-media","content-marketing","email-marketing","influencer","brand-strategy","copywriting","conversion-rate","google-ads","meta-ads","tiktok-marketing","youtube-marketing","affiliate","growth-hacking","pr","b2b-marketing","b2c-marketing","ghana-marketing"] },
  { id: "business", name: "Business", description: "Startups, strategy", icon: "💼", priority: 90,
    topics: ["startups","fundraising","venture-capital","business-plan","operations","leadership","management","hr","hiring","remote-work","saas","ecommerce","retail","supply-chain","negotiation","sme-ghana","african-entrepreneurship","pitch-decks"] },
  { id: "finance", name: "Finance", description: "Investing, MoMo", icon: "💰", priority: 92,
    topics: ["personal-finance","investing","stocks","bonds","crypto","bitcoin","defi","forex","taxes","accounting","budgeting","momo","mobile-money","banking-ghana","insurance","retirement","financial-literacy"] },
  { id: "technology", name: "Technology", description: "AI, cloud, gadgets", icon: "💻", priority: 93,
    topics: ["artificial-intelligence","machine-learning","cloud-computing","cybersecurity","blockchain","iot","5g","hardware","smartphones","enterprise-it","open-source","tech-news","ghana-tech","africa-tech"] },
  { id: "programming", name: "Programming", description: "Code, frameworks", icon: "👨‍💻", priority: 94,
    topics: ["javascript","typescript","python","rust","golang","java","react","nextjs","vue","nodejs","django","fastapi","sql","postgresql","mongodb","docker","kubernetes","aws","git","testing","system-design","algorithms","api-design","graphql","mobile-react-native","flutter","web-security"] },
  { id: "religion", name: "Religion", description: "Faith, ethics", icon: "🙏", priority: 75,
    topics: ["christianity","islam","judaism","hinduism","buddhism","traditional-african-spirituality","theology","ethics","bible-study","quran-study","prayer","worship","ghana-religion"] },
  { id: "health", name: "Health", description: "Wellness, medicine", icon: "🏥", priority: 85,
    topics: ["nutrition","fitness","mental-health","sleep","meditation","public-health","first-aid","ghana-healthcare","tropical-medicine"] },
  { id: "education", name: "Education", description: "Learning, exams", icon: "🎓", priority: 80,
    topics: ["k12","university","online-learning","bece","wassce","scholarships","study-skills","stem-education","ghana-education"] },
  { id: "legal", name: "Legal", description: "Law, rights", icon: "⚖️", priority: 70,
    topics: ["contract-law","employment-law","intellectual-property","privacy-gdpr","criminal-law","ghana-law","human-rights"] },
  { id: "entertainment", name: "Entertainment", description: "Film, gaming", icon: "🎬", priority: 78,
    topics: ["movies","tv-series","streaming","gaming","esports","nollywood","ghana-music","afrobeats","comedy","podcasts"] },
  { id: "music", name: "Music", description: "Production, industry", icon: "🎵", priority: 82,
    topics: ["music-production","songwriting","music-theory","afrobeats","hip-hop","gospel-music","streaming-royalties"] },
  { id: "science", name: "Science", description: "STEM fields", icon: "🔬", priority: 72,
    topics: ["physics","biology","chemistry","astronomy","climate-science","environment","renewable-energy"] },
  { id: "travel", name: "Travel", description: "Tourism, visas", icon: "✈️", priority: 65,
    topics: ["ghana-travel","africa-travel","visa-guides","budget-travel","ecotourism"] },
  { id: "food", name: "Food", description: "Cuisine, recipes", icon: "🍲", priority: 68,
    topics: ["ghanaian-cuisine","west-african-food","recipes","food-business","street-food"] },
  { id: "fashion", name: "Fashion", description: "Style, beauty", icon: "👗", priority: 60,
    topics: ["streetwear","african-fashion","beauty","skincare"] },
  { id: "real-estate", name: "Real Estate", description: "Property", icon: "🏠", priority: 74,
    topics: ["buying-home","renting","property-ghana","mortgages"] },
  { id: "politics", name: "Politics", description: "News, policy", icon: "🏛️", priority: 55,
    topics: ["ghana-politics","africa-politics","elections","policy","fact-checking"] },
  { id: "philosophy", name: "Philosophy", description: "Ethics, thought", icon: "📖", priority: 50,
    topics: ["ethics","logic","stoicism","african-philosophy"] },
  { id: "history", name: "History", description: "World history", icon: "🏺", priority: 58,
    topics: ["world-history","african-history","ghana-history","ancient-civilizations"] },
  { id: "parenting", name: "Parenting", description: "Family life", icon: "👨‍👩‍👧", priority: 62,
    topics: ["parenting-tips","child-development","relationships","marriage"] },
  { id: "automotive", name: "Automotive", description: "Cars, EVs", icon: "🚗", priority: 55,
    topics: ["car-reviews","electric-vehicles","car-maintenance"] },
  { id: "agriculture", name: "Agriculture", description: "Farming", icon: "🌾", priority: 76,
    topics: ["crop-farming","livestock","agribusiness-ghana","cocoa","cashew"] },
  { id: "design", name: "Design", description: "UI, UX", icon: "🎨", priority: 77,
    topics: ["ui-design","ux-research","figma","graphic-design","product-design"] },
];

const VARIANTS = ["general","beginner","advanced","ghana","africa","global","2025","news","howto","reference"];

function generateAgents() {
  const agents = [];
  const perDept = Math.ceil(TARGET / DEPARTMENTS.length);
  for (const dept of DEPARTMENTS) {
    let count = 0;
    let ti = 0;
    let vi = 0;
    while (count < perDept && agents.length < TARGET) {
      const topic = dept.topics[ti % dept.topics.length];
      const variant = VARIANTS[vi % VARIANTS.length];
      const slug = `${dept.id}.${topic}.${variant}`;
      if (!agents.some((a) => a.slug === slug)) {
        agents.push({
          slug,
          department_id: dept.id,
          topic,
          variant,
          display_name: `${dept.name} · ${topic.replace(/-/g, " ")} (${variant})`,
          search_seeds: [
            `${topic.replace(/-/g, " ")} ${dept.name} ${variant}`,
            `${topic} best practices guide`,
            `${topic} ${variant} documentation`,
          ],
          source_hints: ["wikipedia.org", "github.com", "developer.mozilla.org", "edu"],
          status: "active",
          visibility: "system",
        });
        count++;
      }
      vi++;
      if (vi % VARIANTS.length === 0) ti++;
    }
  }
  return agents;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const dept of DEPARTMENTS) {
    await supabase.from("kingdom_departments").upsert({
      id: dept.id,
      name: dept.name,
      description: dept.description,
      icon: dept.icon,
      priority: dept.priority,
    });
  }
  console.log(`Seeded ${DEPARTMENTS.length} departments`);

  const agents = generateAgents();
  console.log(`Generated ${agents.length} sub-agent definitions`);

  for (let i = 0; i < agents.length; i += BATCH) {
    const batch = agents.slice(i, i + BATCH);
    const { error } = await supabase.from("kingdom_sub_agents").upsert(batch, {
      onConflict: "slug",
      ignoreDuplicates: false,
    });
    if (error) {
      console.error(`Batch ${i}:`, error.message);
      process.exit(1);
    }
    console.log(`Upserted ${Math.min(i + BATCH, agents.length)} / ${agents.length}`);
  }

  console.log("Done.");
}

main();
