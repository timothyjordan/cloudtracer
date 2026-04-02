import providers from "./providers.json" with { type: "json" };
import type { ProviderMatch } from "../types.js";

function globMatch(pattern: string, value: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*") +
      "$",
    "i",
  );
  return regex.test(value);
}

export function matchDnsProvider(nameservers: string[]): ProviderMatch | undefined {
  for (const [name, config] of Object.entries(providers.dns)) {
    for (const ns of nameservers) {
      for (const pattern of config.patterns) {
        if (globMatch(pattern, ns)) {
          return {
            name: formatProviderName(name),
            confidence: "high",
          };
        }
      }
    }
  }
  return undefined;
}

export function matchCdnByHeaders(
  headers: Record<string, string>,
): { name: string; evidence: string[] }[] {
  const matches: { name: string; evidence: string[] }[] = [];

  for (const [name, config] of Object.entries(providers.cdn)) {
    const evidence: string[] = [];
    for (const [headerName, pattern] of Object.entries(config.headers)) {
      for (const [actualHeader, actualValue] of Object.entries(headers)) {
        if (
          globMatch(headerName, actualHeader) &&
          globMatch(pattern, actualValue)
        ) {
          evidence.push(`Header: ${actualHeader}: ${actualValue}`);
        }
      }
    }
    if (evidence.length > 0) {
      matches.push({ name: formatProviderName(name), evidence });
    }
  }

  return matches;
}

export function matchCdnByCname(cnames: string[]): { name: string; evidence: string[] }[] {
  const matches: { name: string; evidence: string[] }[] = [];

  for (const [name, config] of Object.entries(providers.cdn)) {
    const evidence: string[] = [];
    for (const cname of cnames) {
      for (const pattern of config.cnames) {
        if (globMatch(pattern, cname)) {
          evidence.push(`CNAME: ${cname}`);
        }
      }
    }
    if (evidence.length > 0) {
      matches.push({ name: formatProviderName(name), evidence });
    }
  }

  return matches;
}

export function matchHostingByAsn(asn: number): ProviderMatch | undefined {
  for (const [name, config] of Object.entries(providers.hosting)) {
    if (config.asns.includes(asn)) {
      return {
        name: formatProviderName(name),
        confidence: "high",
      };
    }
  }
  return undefined;
}

export function matchEmailProvider(mxExchanges: string[]): ProviderMatch | undefined {
  for (const [name, config] of Object.entries(providers.email)) {
    for (const mx of mxExchanges) {
      for (const pattern of config.mx_patterns) {
        if (globMatch(pattern, mx)) {
          return {
            name: formatProviderName(name),
            confidence: "high",
          };
        }
      }
    }
  }
  return undefined;
}

export function matchThirdPartyScripts(
  scriptSrcs: string[],
): { name: string; category: string; evidence: string }[] {
  const matches: { name: string; category: string; evidence: string }[] = [];
  const seen = new Set<string>();

  for (const [name, config] of Object.entries(providers.thirdparty)) {
    for (const src of scriptSrcs) {
      for (const pattern of config.scripts) {
        if (src.toLowerCase().includes(pattern.toLowerCase()) && !seen.has(name)) {
          seen.add(name);
          matches.push({
            name: formatProviderName(name),
            category: config.category,
            evidence: `script src: ${src}`,
          });
        }
      }
    }
  }

  return matches;
}

export function matchHtmlFrameworks(
  html: string,
): { name: string; category: string; evidence: string }[] {
  const matches: { name: string; category: string; evidence: string }[] = [];
  const seen = new Set<string>();

  for (const [name, config] of Object.entries(providers.html_frameworks)) {
    for (const pattern of config.html_patterns) {
      if (html.includes(pattern) && !seen.has(name)) {
        seen.add(name);
        matches.push({
          name: formatProviderName(name),
          category: config.category,
          evidence: `html pattern: ${pattern}`,
        });
      }
    }
  }

  return matches;
}

function formatProviderName(key: string): string {
  const names: Record<string, string> = {
    cloudflare: "Cloudflare",
    route53: "Amazon Route 53",
    google_cloud_dns: "Google Cloud DNS",
    google_cloud: "Google Cloud Platform",
    digitalocean: "DigitalOcean",
    namecheap: "Namecheap",
    godaddy: "GoDaddy",
    dnsimple: "DNSimple",
    azure: "Microsoft Azure",
    netlify: "Netlify",
    vercel: "Vercel",
    ns1: "NS1",
    dyn: "Dyn",
    ultradns: "UltraDNS",
    hetzner: "Hetzner",
    linode: "Linode",
    ovh: "OVH",
    fastly: "Fastly",
    akamai: "Akamai",
    cloudfront: "Amazon CloudFront",
    bunnycdn: "BunnyCDN",
    keycdn: "KeyCDN",
    stackpath: "StackPath",
    sucuri: "Sucuri",
    incapsula: "Imperva Incapsula",
    aws: "Amazon Web Services",
    vultr: "Vultr",
    oracle_cloud: "Oracle Cloud",
    ibm_cloud: "IBM Cloud",
    fly_io: "Fly.io",
    render: "Render",
    railway: "Railway",
    github_pages: "GitHub Pages",
    google_workspace: "Google Workspace",
    microsoft_365: "Microsoft 365",
    protonmail: "ProtonMail",
    zoho: "Zoho Mail",
    fastmail: "Fastmail",
    mimecast: "Mimecast",
    barracuda: "Barracuda",
    mailgun: "Mailgun",
    sendgrid: "SendGrid",
    postmark: "Postmark",
    amazon_ses: "Amazon SES",
    icloud: "iCloud Mail",
    yahoo: "Yahoo Mail",
    rackspace: "Rackspace Email",
    // Analytics
    google_analytics: "Google Analytics",
    facebook_pixel: "Facebook Pixel",
    hotjar: "Hotjar",
    mixpanel: "Mixpanel",
    segment: "Segment",
    amplitude: "Amplitude",
    heap: "Heap",
    heap_analytics: "Heap",
    plausible: "Plausible Analytics",
    fathom: "Fathom Analytics",
    cloudflare_insights: "Cloudflare Web Analytics",
    posthog: "PostHog",
    microsoft_clarity: "Microsoft Clarity",
    matomo: "Matomo",
    pendo: "Pendo",
    fullstory: "FullStory",
    logrocket: "LogRocket",
    mouseflow: "Mouseflow",
    pirsch: "Pirsch Analytics",
    simple_analytics: "Simple Analytics",
    // Advertising
    google_ads: "Google Ads",
    twitter_pixel: "X (Twitter) Pixel",
    linkedin_insight: "LinkedIn Insight Tag",
    pinterest_tag: "Pinterest Tag",
    tiktok_pixel: "TikTok Pixel",
    reddit_pixel: "Reddit Pixel",
    snapchat_pixel: "Snapchat Pixel",
    bing_ads: "Microsoft Advertising",
    criteo: "Criteo",
    // Chat
    intercom: "Intercom",
    drift: "Drift",
    crisp: "Crisp",
    livechat: "LiveChat",
    tawk_to: "Tawk.to",
    olark: "Olark",
    tidio: "Tidio",
    freshchat: "Freshchat",
    chatwoot: "Chatwoot",
    // Support
    zendesk: "Zendesk",
    freshdesk: "Freshdesk",
    help_scout: "Help Scout",
    // Marketing
    hubspot: "HubSpot",
    mailchimp: "Mailchimp",
    marketo: "Marketo",
    activecampaign: "ActiveCampaign",
    klaviyo: "Klaviyo",
    convertkit: "ConvertKit",
    drip: "Drip",
    optinmonster: "OptinMonster",
    sumo: "Sumo",
    privy: "Privy",
    // Payments
    stripe: "Stripe",
    paypal: "PayPal",
    square: "Square",
    paddle: "Paddle",
    lemon_squeezy: "Lemon Squeezy",
    braintree: "Braintree",
    // Monitoring
    sentry: "Sentry",
    datadog: "Datadog",
    new_relic: "New Relic",
    bugsnag: "Bugsnag",
    rollbar: "Rollbar",
    // Fonts
    google_fonts: "Google Fonts",
    typekit: "Adobe Fonts",
    font_awesome: "Font Awesome",
    bunny_fonts: "Bunny Fonts",
    fontshare: "Fontshare",
    // Frameworks
    jquery: "jQuery",
    react: "React",
    bootstrap: "Bootstrap",
    vue: "Vue.js",
    angular: "Angular",
    tailwind_css: "Tailwind CSS",
    htmx: "HTMX",
    alpine_js: "Alpine.js",
    d3: "D3.js",
    lodash: "Lodash",
    // Security
    recaptcha: "reCAPTCHA",
    hcaptcha: "hCaptcha",
    cloudflare_turnstile: "Cloudflare Turnstile",
    // A/B Testing
    optimizely: "Optimizely",
    launchdarkly: "LaunchDarkly",
    vwo: "VWO",
    google_optimize: "Google Optimize",
    ab_tasty: "AB Tasty",
    // CMS
    wordpress: "WordPress",
    shopify: "Shopify",
    squarespace: "Squarespace",
    webflow: "Webflow",
    wix: "Wix",
    ghost: "Ghost",
    contentful: "Contentful",
    prismic: "Prismic",
    sanity: "Sanity",
    // Video
    youtube: "YouTube",
    vimeo: "Vimeo",
    wistia: "Wistia",
    vidyard: "Vidyard",
    loom: "Loom",
    // Maps
    google_maps: "Google Maps",
    mapbox: "Mapbox",
    leaflet: "Leaflet",
    openstreetmap: "OpenStreetMap",
    // Auth
    auth0: "Auth0",
    firebase: "Firebase",
    clerk: "Clerk",
    supabase: "Supabase",
    // Search
    algolia: "Algolia",
    typesense: "Typesense",
    // Consent
    cookiebot: "Cookiebot",
    onetrust: "OneTrust",
    trustarc: "TrustArc",
    iubenda: "Iubenda",
    osano: "Osano",
    usercentrics: "Usercentrics",
    quantcast: "Quantcast",
    // Social
    gravatar: "Gravatar",
    disqus: "Disqus",
    addthis: "AddThis",
    sharethis: "ShareThis",
    // Forms
    typeform: "Typeform",
    jotform: "Jotform",
    // Scheduling
    calendly: "Calendly",
    cal_com: "Cal.com",
    // HTML-detected frameworks
    nextjs: "Next.js",
    nuxtjs: "Nuxt",
    gatsby: "Gatsby",
    remix: "Remix",
    sveltekit: "SvelteKit",
    astro: "Astro",
    vite: "Vite",
    webpack: "Webpack",
    turbopack: "Turbopack",
    tanstack_query: "TanStack Query",
    tanstack_router: "TanStack Router",
    tanstack_table: "TanStack Table",
    react_router: "React Router",
    emotion: "Emotion",
    styled_components: "Styled Components",
    material_ui: "Material UI",
    chakra_ui: "Chakra UI",
    tailwind_css_detected: "Tailwind CSS",
    angular_detected: "Angular",
    vue_detected: "Vue.js",
    svelte_detected: "Svelte",
    ember: "Ember.js",
    solid_js: "SolidJS",
    qwik: "Qwik",
    eleventy: "Eleventy",
    hugo: "Hugo",
    jekyll: "Jekyll",
    docusaurus: "Docusaurus",
    storybook: "Storybook",
  };
  return names[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
