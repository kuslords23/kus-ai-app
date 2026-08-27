/**
 * Starter public-knowledge packets so Kingdom answers work before harvest fills up.
 */

export type StarterPacket = {
  departmentId: string;
  domain: string;
  content: string;
  question: string;
  answer: string;
};

export const STARTER_PACKETS: StarterPacket[] = [
  {
    departmentId: "finance",
    domain: "finance",
    question: "Explain MoMo in Ghana",
    answer:
      "MoMo (Mobile Money) in Ghana is electronic money stored on your phone number. You send, receive, pay bills, and buy airtime without a bank account. Major providers include MTN MoMo, Telecel Cash (formerly Vodafone Cash), and AT Money. You need a registered SIM, PIN, and can cash in/out via agents. Bank linking and merchant payments are common. Always protect your PIN and confirm the recipient name before sending.",
    content: `# MoMo (Mobile Money) in Ghana

MoMo is Ghana's mobile money system — digital cash tied to a phone number.

## What it is
- Store money on your mobile wallet
- Send/receive to other wallets and bank accounts
- Pay merchants, utilities, and airtime
- Cash in (deposit) and cash out (withdraw) through agents

## Main providers
- **MTN MoMo** — largest network
- **Telecel Cash** (formerly Vodafone Cash)
- **AT Money** (AirtelTigo)

## How people use it
1. Register SIM with ID at an agent or provider
2. Set a PIN
3. Cash in at an agent or from a bank
4. Transfer by entering recipient number + amount + PIN
5. Always verify the displayed recipient name

## Safety
- Never share your PIN or OTP
- Beware of fake support calls and “send money to reverse” scams
- Use official app/USSD codes from your provider

## Related
Mobile money, MTN MoMo, Telecel Cash, Ghana fintech, wallet transfers.`,
  },
  {
    departmentId: "finance",
    domain: "finance",
    question: "What is MTN MoMo?",
    answer:
      "MTN MoMo is MTN Ghana’s mobile money wallet. Users send money, pay bills, buy airtime, and cash in/out via agents using USSD or the MoMo app, secured by a PIN.",
    content: `# MTN MoMo

MTN Mobile Money (MoMo) is the leading mobile wallet in Ghana. Access via USSD or the MoMo app. Features include P2P transfers, merchant pay, airtime, and agent cash-in/out.`,
  },
  {
    departmentId: "sports",
    domain: "sports",
    question: "What is the Ghana Premier League?",
    answer:
      "The Ghana Premier League is the top professional football league in Ghana, run under the Ghana Football Association. Clubs compete for the title and continental qualification spots.",
    content: `# Ghana Premier League

Top-tier Ghanaian club football competition. Follow fixtures, standings, and transfers through official GFA and league sources.`,
  },
  {
    departmentId: "marketing",
    domain: "marketing",
    question: "What is SEO?",
    answer:
      "SEO (Search Engine Optimization) means improving your website or content so it ranks higher in Google and other search engines for relevant queries — through useful content, technical health, and credible links.",
    content: `# SEO basics

Search Engine Optimization helps pages rank in organic search. Core pillars: relevant content, technical performance, and authority/backlinks.`,
  },
  {
    departmentId: "programming",
    domain: "programming",
    question: "What is an API?",
    answer:
      "An API (Application Programming Interface) lets software talk to other software. On the web, APIs usually accept HTTP requests and return JSON data so apps can read or update information.",
    content: `# API (Application Programming Interface)

APIs expose functions or data over a contract (often REST/JSON). Clients send requests; servers respond with structured data.`,
  },
  {
    departmentId: "religion",
    domain: "religion",
    question: "What religions are common in Ghana?",
    answer:
      "Ghana is religiously diverse. Christianity is the largest tradition, Islam is significant especially in the north and urban centers, and traditional African spiritual practices remain part of cultural life for many communities.",
    content: `# Religion in Ghana

Major traditions include Christianity, Islam, and indigenous/traditional African spirituality. Respect and coexistence are part of everyday public life.`,
  },
  {
    departmentId: "business",
    domain: "business",
    question: "How do small businesses in Ghana get started?",
    answer:
      "Many Ghana SMEs start by validating a local need, registering the business, opening MoMo/bank collections, keeping simple records, and selling through markets, WhatsApp, or social media before expanding.",
    content: `# Starting a small business in Ghana

Common path: idea → customer test → registration → payments (MoMo/bank) → sales channels → basic bookkeeping.`,
  },
  {
    departmentId: "health",
    domain: "health",
    question: "What is basic first aid?",
    answer:
      "Basic first aid is immediate care for injury or illness before professional help arrives — check danger, response, breathing, call emergency services, and treat bleeding or burns carefully.",
    content: `# Basic first aid

Priorities: scene safety, responsiveness, airway/breathing, call for help, control bleeding, and do not move seriously injured people unnecessarily.`,
  },
];
