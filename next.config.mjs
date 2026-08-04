/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development output separate from `next build` output. Running a
  // build while the dev server is alive otherwise removes assets from `.next`
  // and leaves the browser with unstyled HTML until the server is restarted.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
