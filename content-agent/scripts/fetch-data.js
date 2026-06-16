import 'dotenv/config';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN || TOKEN === 'paste_your_apify_token_here') {
  console.error('ERROR: Set APIFY_TOKEN in your .env file first.');
  process.exit(1);
}

const MY_HANDLE = 'kirti_pandey';
const COMPETITORS = ['mayaewk', 'kfreshmusic', 'blazefromthenewelite', 'jwwaynic', 'stevenshaeferr'];

const ACTOR = 'apify~instagram-scraper';
const BASE_URL = 'https://api.apify.com/v2';

async function scrapeAccount(handle, resultsLimit = 50) {
  console.log(`  Scraping @${handle} (up to ${resultsLimit} posts)...`);

  const url = `${BASE_URL}/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}&timeout=120&memory=512`;

  const body = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: 'posts',
    resultsLimit,
    addParentData: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error for @${handle}: ${res.status} ${text}`);
  }

  const items = await res.json();
  console.log(`  ✓ @${handle} — ${items.length} posts returned`);
  return items;
}

function extractStats(posts, handle) {
  // Pull profile-level fields from first post that has them
  const profile = posts.find(p => p.followersCount != null) || posts[0] || {};
  const followers = profile.followersCount ?? profile.ownerFollowersCount ?? null;

  const ranked = posts
    .map(p => ({
      id: p.id ?? p.shortCode,
      shortCode: p.shortCode,
      url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
      caption: (p.caption ?? p.alt ?? '').slice(0, 120),
      views: p.videoViewCount ?? p.videoPlayCount ?? p.playCount ?? 0,
      likes: p.likesCount ?? p.likes ?? 0,
      comments: p.commentsCount ?? p.comments ?? 0,
      timestamp: p.timestamp ?? p.takenAtTimestamp ?? null,
      type: p.type ?? (p.isVideo ? 'Video' : 'Image'),
      displayUrl: p.displayUrl ?? p.thumbnailUrl ?? null,
    }))
    .sort((a, b) => b.views - a.views);

  const totalViews = ranked.reduce((s, p) => s + p.views, 0);
  const totalLikes = ranked.reduce((s, p) => s + p.likes, 0);
  const engagementRate = posts.length > 0 && followers
    ? ((totalLikes / posts.length / followers) * 100).toFixed(2)
    : null;

  return { handle, followers, totalViews, totalLikes, engagementRate, posts: ranked };
}

async function main() {
  console.log('\n=== Content Agent — Data Fetch ===\n');

  // My account (more posts for accurate top-post ranking)
  console.log('Fetching YOUR account:');
  const myRaw = await scrapeAccount(MY_HANDLE, 200);
  const myData = extractStats(myRaw, MY_HANDLE);

  // Competitors
  console.log('\nFetching competitor accounts:');
  const competitorData = [];
  for (const handle of COMPETITORS) {
    try {
      const raw = await scrapeAccount(handle, 50);
      competitorData.push(extractStats(raw, handle));
    } catch (err) {
      console.warn(`  ⚠ Skipped @${handle}: ${err.message}`);
    }
  }

  // Build output
  const output = {
    fetchedAt: new Date().toISOString(),
    myAccount: myData,
    competitors: competitorData,
  };

  const outPath = join(__dir, '..', 'dashboard', 'data.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ Saved to dashboard/data.json`);

  // Print summary
  const top = myData.posts[0];
  console.log('\n--- YOUR STATS ---');
  console.log(`  Handle:      @${myData.handle}`);
  console.log(`  Followers:   ${myData.followers?.toLocaleString() ?? 'n/a'}`);
  console.log(`  Total views: ${myData.totalViews.toLocaleString()}`);
  console.log(`  Engagement:  ${myData.engagementRate ?? 'n/a'}%`);
  if (top) {
    console.log(`  Top post:    ${top.views.toLocaleString()} views — ${top.url}`);
    console.log(`  Caption:     "${top.caption.slice(0, 80)}..."`);
  }

  console.log('\n--- TOP COMPETITOR POSTS ---');
  const allCompetitorPosts = competitorData.flatMap(c =>
    c.posts.slice(0, 5).map(p => ({ ...p, account: c.handle }))
  ).sort((a, b) => b.views - a.views).slice(0, 5);

  allCompetitorPosts.forEach((p, i) => {
    console.log(`  ${i + 1}. @${p.account} — ${p.views.toLocaleString()} views — ${p.url}`);
  });

  console.log('\n✓ Done.\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
