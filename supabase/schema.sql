-- ============================================================================
-- 교회 선교카페 웹 기반 주문 및 POS 시스템 - Supabase DB 스키마 및 초기 데이터
-- 실행 방법: Supabase Dashboard -> SQL Editor -> New Query 에 붙여넣고 Run 실행
-- ============================================================================

-- 1. UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 카페 기본 설정 테이블 (cafe_settings)
-- POS 화면에서 관리자가 카페 이름, 입금 계좌번호, 예금주, 정산용 4자리 PIN 번호 및 카테고리 목록을 실시간 수정 가능
CREATE TABLE IF NOT EXISTS public.cafe_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  cafe_name TEXT NOT NULL DEFAULT '은혜 선교카페',
  bank_name TEXT NOT NULL DEFAULT '카카오뱅크',
  account_number TEXT NOT NULL DEFAULT '3333-01-2345678',
  account_holder TEXT NOT NULL DEFAULT '은혜교회선교카페',
  admin_pin TEXT NOT NULL DEFAULT '1234',
  categories JSONB NOT NULL DEFAULT '[
    {"id": "coffee", "name": "커피 (Coffee)", "is_visible": true},
    {"id": "non-coffee", "name": "논커피 라떼", "is_visible": true},
    {"id": "tea-ade", "name": "티 & 에이드", "is_visible": true},
    {"id": "dessert", "name": "디저트", "is_visible": true}
  ]'::jsonb,
  is_qr_order_enabled BOOLEAN NOT NULL DEFAULT true,
  qr_pause_message TEXT NOT NULL DEFAULT '현재 예배 시간(또는 재료 준비 중)으로 모바일 QR 주문을 잠시 멈추었습니다. 잠시 후 다시 이용해 주세요!',
  allow_transfer BOOLEAN NOT NULL DEFAULT true,
  allow_cash BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 cafe_settings 테이블에 신규 컬럼들이 없는 경우 자동 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cafe_settings' AND column_name = 'categories'
  ) THEN
    ALTER TABLE public.cafe_settings ADD COLUMN categories JSONB NOT NULL DEFAULT '[
      {"id": "coffee", "name": "커피 (Coffee)", "is_visible": true},
      {"id": "non-coffee", "name": "논커피 라떼", "is_visible": true},
      {"id": "tea-ade", "name": "티 & 에이드", "is_visible": true},
      {"id": "dessert", "name": "디저트", "is_visible": true}
    ]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cafe_settings' AND column_name = 'is_qr_order_enabled'
  ) THEN
    ALTER TABLE public.cafe_settings ADD COLUMN is_qr_order_enabled BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE public.cafe_settings ADD COLUMN qr_pause_message TEXT NOT NULL DEFAULT '현재 예배 시간(또는 재료 준비 중)으로 모바일 QR 주문을 잠시 멈추었습니다. 잠시 후 다시 이용해 주세요!';
    ALTER TABLE public.cafe_settings ADD COLUMN allow_transfer BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE public.cafe_settings ADD COLUMN allow_cash BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

INSERT INTO public.cafe_settings (id, cafe_name, bank_name, account_number, account_holder, admin_pin)
VALUES ('default', '은혜 선교카페', '카카오뱅크', '3333-01-2345678', '은혜교회선교카페', '1234')
ON CONFLICT (id) DO NOTHING;

-- 3. 메뉴 테이블 (menus)
-- category는 관리자가 자유롭게 추가/삭제할 수 있도록 고정 CHECK 제약을 두지 않음
CREATE TABLE IF NOT EXISTS public.menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  has_temp_option BOOLEAN NOT NULL DEFAULT true,
  default_temp TEXT NOT NULL DEFAULT 'ICE' CHECK (default_temp IN ('HOT', 'ICE', 'NONE')),
  is_sold_out BOOLEAN NOT NULL DEFAULT false,
  is_new BOOLEAN NOT NULL DEFAULT false,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 menus 테이블에 고정 카테고리 CHECK 제약이 있다면 제거 (자유로운 카테고리 추가 허용)
ALTER TABLE public.menus DROP CONSTRAINT IF EXISTS menus_category_check;

-- 4. 주문 마스터 테이블 (orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('transfer', 'cash')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  order_source TEXT NOT NULL DEFAULT 'qr' CHECK (order_source IN ('qr', 'pos')),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 기존 테이블에 대한 마이그레이션 안전 스크립트
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'phone_last4'
  ) THEN
    ALTER TABLE public.orders RENAME COLUMN phone_last4 TO phone;
  END IF;

  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_phone_last4_check;
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled'));
END $$;

-- 5. 주문 상세 품목 테이블 (order_items)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_id UUID REFERENCES public.menus(id) ON DELETE SET NULL,
  menu_name TEXT NOT NULL,
  temp_option TEXT NOT NULL DEFAULT 'ICE' CHECK (temp_option IN ('HOT', 'ICE', 'NONE')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_menus_sort_order ON public.menus(sort_order ASC);

-- 7. RLS (Row Level Security) 설정
ALTER TABLE public.cafe_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access to cafe_settings" ON public.cafe_settings;
CREATE POLICY "Allow public access to cafe_settings" ON public.cafe_settings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to menus" ON public.menus;
CREATE POLICY "Allow public access to menus" ON public.menus
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to orders" ON public.orders;
CREATE POLICY "Allow public access to orders" ON public.orders
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public access to order_items" ON public.order_items;
CREATE POLICY "Allow public access to order_items" ON public.order_items
  FOR ALL USING (true) WITH CHECK (true);

-- 8. Supabase Realtime 활성화
ALTER TABLE public.cafe_settings REPLICA IDENTITY FULL;
ALTER TABLE public.menus REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cafe_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cafe_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'menus'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menus;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

-- 9. 초기 테스트용 샘플 메뉴 데이터 삽입
INSERT INTO public.menus (name, category, price, has_temp_option, default_temp, is_sold_out, is_new, is_visible, sort_order)
VALUES
  ('아메리카노', 'coffee', 2000, true, 'ICE', false, false, true, 10),
  ('헤이즐넛 아메리카노', 'coffee', 2500, true, 'ICE', false, false, true, 20),
  ('카페라떼', 'coffee', 2500, true, 'ICE', false, false, true, 30),
  ('바닐라라떼', 'coffee', 3000, true, 'ICE', false, true, true, 40),
  ('카라멜 마끼아또', 'coffee', 3000, true, 'ICE', false, false, true, 50),
  ('초코라떼', 'non-coffee', 2500, true, 'ICE', false, false, true, 60),
  ('고구마라떼', 'non-coffee', 3000, true, 'HOT', false, false, true, 70),
  ('딸기라떼', 'non-coffee', 3000, false, 'ICE', false, true, true, 80),
  ('복숭아 아이스티', 'tea-ade', 2000, false, 'ICE', false, false, true, 90),
  ('유자차', 'tea-ade', 2500, true, 'HOT', false, false, true, 100),
  ('레몬에이드', 'tea-ade', 3000, false, 'ICE', false, false, true, 110),
  ('캐모마일 허브티', 'tea-ade', 2500, true, 'HOT', false, false, true, 120),
  ('수제 쿠키', 'dessert', 1500, false, 'NONE', false, false, true, 130)
ON CONFLICT DO NOTHING;
