# 교회 선교카페 웹 기반 주문 및 POS 시스템 (1차 MVP)

Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (Realtime) 기반의 교회 선교카페 전용 주문 및 태블릿 POS 시스템입니다.

## 주요 화면 경로

- `/` : 홈 게이트웨이 화면
- `/order` : **손님용 QR 모바일 주문 화면** (세로형 최적화, 계좌번호 원클릭 복사 및 총 결제 금액 대형 표시)
- `/pos` : **카운터 태블릿 통합 POS 화면** (가로형 최적화, 좌측 직접 주문 + 우측 실시간 주문 대기열 + 주문 수정/취소 + 원터치 품절 및 신메뉴 관리)
- `/admin` : **일일 정산 대시보드** (4자리 PIN 잠금 - 기본값 `1234`, 완료 주문 기준 총 매출, 계좌이체/현금 합계, 메뉴별 판매 수량, 취소 건수 집계)

## 로컬 실행 방법

1. 패키지 설치 및 개발 서버 실행:
   ```bash
   npm install
   npm run dev
   ```
2. 브라우저에서 `http://localhost:3000` 접속
   - `.env.local` 설정 전에도 **로컬 실시간 데모 모드**(`localStorage` + `BroadcastChannel`)로 즉시 동작하여 브라우저 탭 간 실시간 주문·품절 동기화를 바로 테스트할 수 있습니다.

## Supabase 연동 방법

1. Supabase 프로젝트 생성 후 **SQL Editor**에서 [`supabase/schema.sql`](./supabase/schema.sql) 전체 스크립트를 실행합니다.
2. 프로젝트 루트에 `.env.local` 파일을 생성하고([`.env.example`](./.env.example) 참고) Supabase URL과 Anon Key를 입력합니다:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_CAFE_BANK_NAME=카카오뱅크
   NEXT_PUBLIC_CAFE_ACCOUNT_NUMBER=3333-01-2345678
   NEXT_PUBLIC_CAFE_ACCOUNT_HOLDER=은혜교회선교카페
   NEXT_PUBLIC_ADMIN_PIN=1234
   ```
