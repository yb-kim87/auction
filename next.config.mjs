/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the development output separate from `next build` output. Running a
  // build while the dev server is alive otherwise removes assets from `.next`
  // and leaves the browser with unstyled HTML until the server is restarted.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Next.js Multi-Zones: /courses/* 는 별도 배포(auction-courses)로 리라이트한다.
  // COURSES_APP_URL이 없으면(로컬에서 이 앱만 단독 구동할 때 등) 리라이트를
  // 적용하지 않아 기존 동작에 영향이 없다.
  async rewrites() {
    const coursesAppUrl = process.env.COURSES_APP_URL;
    if (!coursesAppUrl) return [];
    return [
      { source: "/courses", destination: `${coursesAppUrl}/courses` },
      { source: "/courses/:path*", destination: `${coursesAppUrl}/courses/:path*` },
    ];
  },
};

export default nextConfig;
