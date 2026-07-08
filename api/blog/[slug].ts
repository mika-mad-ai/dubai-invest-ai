/**
 * Endpoint to fetch a single blog post by its slug.
 *
 * GET /api/blog/[slug]
 * Returns: The full content of a single blog post.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchBlogPost(slug: string): Promise<any | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_posts?select=*&slug=eq.${slug}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        signal: AbortSignal.timeout(4_000),
      }
    );
    if (!res.ok) return null;
    const posts = await res.json();
    return posts[0] ?? null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: { query: { slug: string } },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { json: (data: object) => void };
  }
) {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { slug } = req.query;
  const post = await fetchBlogPost(slug);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  return res.status(200).json({ post });
}
