# 작업 히스토리 문서화 규칙

이 저장소(auction, 프론트)에는 자체 `docs/history`가 없다. 작업 기록은
`../auction-api/docs/history/*.md`에 남긴다 — 먼저 그 폴더의
[README.md](../auction-api/docs/history/README.md) 규칙을 읽고, 유사 주제
문서가 있으면 追記, 없으면 새 문서(`YYYY-MM-DD_NN_주제.md`)를 만든다.
이미 문서화했거나 사소한 변경이면 생략해도 된다.

# 프론트엔드 아키텍처 규칙 (2026-08-20 리팩터로 확정)

2026-08-20에 `src/app` 전체를 라우팅 전용으로 컴포넌트화하고, 유저 프로필을
zustand 전역 스토어로 옮기고, API 레이어를 axios + TanStack Query로
전환했다. 배경과 상세 내용은
[docs/history/2026-08-20_01_frontend-architecture-refactor.md](../auction-api/docs/history/2026-08-20_01_frontend-architecture-refactor.md)
참고. **새 코드를 작성하거나 기존 코드를 고칠 때는 아래 패턴을 그대로 따를 것.**

## 1. 라우팅과 UI 분리 — `src/app`은 라우팅 전용

- `src/app/**/page.tsx`는 라우팅만 담당한다. 실제 UI/로직은 절대 여기 직접
  작성하지 말고, `src/components/<kebab-case-route-name>/<PascalCaseName>PageClient.tsx`에
  작성한 뒤 `page.tsx`에서 호출만 한다.

```tsx
// src/app/foo/page.tsx
import { FooPageClient } from "@/components/foo/FooPageClient";
export default function FooPage() {
  return <FooPageClient />;
}
```

- `PageClient` 컴포넌트는 **named export**로 작성(`export function
  FooPageClient() { ... }`), `"use client"`는 `PageClient` 파일 쪽에 붙인다.
  `page.tsx` 래퍼 자체는 서버 컴포넌트로 두고 `"use client"`를 붙이지 않는다.
- `useSearchParams()`를 쓰는 페이지는 정적 export를 위해 `Suspense` 경계로
  감싼다(`account`, `auth/kakao/callback` 참고).
- 순수 리다이렉트만 하는 라우트(예: 구 경로 호환용)는 예외적으로 `page.tsx`에
  직접 남겨도 된다 — 추출할 UI 자체가 없기 때문.
- admin 하위 패널(`src/app/admin/*Panel.tsx`, `*Tab.tsx`)처럼 페이지가 아닌
  기존 컴포넌트는 옮기지 않는다. 새로 컴포넌트를 상대경로로 import해야 하는
  경우, `PageClient`가 `src/app/*` 밖(`src/components/*`)에 있으므로 반드시
  절대경로(`@/app/admin/...`)로 import한다.

## 2. 로그인 유저 정보 — `useProfileStore`만 사용, 직접 fetch 금지

- 로그인한 유저의 프로필(이름/권한/설정 등)이 필요하면 `fetchMyProfile()`을
  직접 호출하지 말고 반드시 `src/store/useProfileStore.ts`를 통해서만 접근한다.

```tsx
import { useProfileStore } from "@/store/useProfileStore";

const profile = useProfileStore((s) => s.profile);
const fetchProfile = useProfileStore((s) => s.fetchProfile);

useEffect(() => {
  fetchProfile().catch(() => {});
}, [fetchProfile]);
```

- `fetchProfile()`은 이미 로드됐거나 요청이 진행 중이면 그 결과를 재사용한다
  — 여러 컴포넌트가 동시에 마운트돼도 `/users/me` 요청이 중복으로 나가지
  않는다. 강제로 새로 받아와야 하면(로그인 직후, 설정 변경 직후 등)
  `fetchProfile({ force: true })`를 쓴다.
- 프로필을 수정했으면 로컬 state뿐 아니라 스토어도 갱신한다:
  전체 교체는 `setProfile(updated)`, 부분 갱신(예: AI 분석 사용 횟수
  증가)은 `patchProfile({ aiAnalysisUsed: next })`.
- 로그아웃 처리(`clearAuthCookie()` 호출 지점)에는 항상 `clearProfile()`도
  같이 호출해서 스토어를 비운다.
- 같은 헤더 UI(알림 벨, 로그인/로그아웃 영역)를 여러 페이지가 공유한다면
  페이지마다 복붙하지 말고 `src/components/course-site/CourseSiteHeaderAuth.tsx`
  같은 공유 컴포넌트로 뽑아낸다(courses/courses-apply/courses-webinar
  3개에 복붙돼 있던 걸 정리한 전례 참고).

## 3. API 요청 — axios(`api.ts`) + TanStack Query, 컴포넌트에서 직접 fetch 금지

- 새 API 호출 함수는 `src/lib/api.ts`에 추가한다. 이 파일의 함수들은
  `src/lib/http.ts`의 axios 인스턴스(`http`) 또는 `fetch`와 동일한
  시그니처의 어댑터 `apiFetch(url, init)`를 통해 네트워크 요청을 보낸다 —
  raw `fetch()`를 새로 쓰지 않는다.
  - GET처럼 단순한 요청은 `http.get(...)` 같은 axios 메서드를 직접 써도
    되고, 기존 함수들과 스타일을 맞추고 싶으면 `apiFetch` + 기존
    `parseErrorMessage`/`readJsonResponse` 헬퍼 조합을 그대로 따라 해도 된다.
  - **axios로 새 요청 계열을 추가할 때, `src/lib/http.ts`에 이미 구현된
    401(accessToken 만료) 자동 refresh-and-retry 로직이 적용되는지 반드시
    확인한다.** axios는 `window.fetch`를 거치지 않으므로 기존
    `auth-fetch-interceptor.ts`의 보호를 받지 못한다 — 이걸 놓치면 새
    요청 경로만 30분마다 강제 로그아웃되는 회귀가 생긴다.
- 컴포넌트에서 목록/상세 등 서버 데이터를 읽어올 때는 `useEffect` +
  `useState` + 수동 `fetch`/`api.ts` 호출 조합을 새로 만들지 않는다.
  `@tanstack/react-query`의 `useQuery`(단건/목록), `useInfiniteQuery`(무한
  스크롤 페이지네이션), `useMutation`(생성/수정/삭제)을 사용한다.

```tsx
const itemsQuery = useQuery({ queryKey: ["things"], queryFn: fetchThings });
const items = itemsQuery.data ?? [];
const loading = itemsQuery.isPending;
```

- 여러 페이지가 같은 데이터를 쓰면(관심물건, 강의실 소개 이미지 등) 같은
  쿼리 키를 공유해서 캐시도 같이 쓰게 한다 — 예: 관심물건은 어디서든
  `["favorites"]`, 강의실 소개 이미지는 `["landing-images"]`.
- 목록을 수정하는 액션(등록/수정/삭제/토글) 뒤에 목록을 새로 불러와야 하면
  `queryClient.invalidateQueries({ queryKey: [...] })`를 쓴다. 관심물건
  토글처럼 클릭 즉시 화면이 반응해야 하는 경우 `useMutation`의
  `onMutate`에서 `queryClient.setQueryData`로 낙관적 업데이트하고, `onError`
  에서 이전 캐시로 롤백한다(`FavoritesPageClient.tsx`,
  `SearchPageClient.tsx`의 `toggleFavoriteMutation` 참고).
- 예외: 영상 재생/진도저장처럼 이미 복잡한 상태 머신이 있고 데이터
  중복·재사용 이슈가 없는 곳은 억지로 useQuery로 바꾸지 않아도 된다
  (`MyCourseClient`의 재생 로직 참고 — 이런 곳은 그대로 뒀다).
