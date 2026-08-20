/** 무료 웨비나 신청(카카오 로그인) 인가 URL 생성.
 * NEXT_PUBLIC_KAKAO_REST_API_KEY/NEXT_PUBLIC_KAKAO_REDIRECT_URI는
 * auction-api의 KAKAO_REST_API_KEY/KAKAO_REDIRECT_URI와 동일한 값이어야 한다. */
export function getKakaoAuthUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? "";
  const redirectUri = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}
