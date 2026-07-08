/**
 * Endpoint to fetch all blog posts.
 *
 * GET /api/blog
 * Returns: A list of all blog posts with title, slug, and creation date.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchBlogPosts(): Promise<any[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_posts?select=title,slug,created_at&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(4_000),
      }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function handler(
  _req: unknown,
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { json: (data: object) => void };
  }
) {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const posts = await fetchBlogPosts();

  return res.status(200).json({ posts });
}
