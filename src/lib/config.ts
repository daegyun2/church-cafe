import { CafeSettings, CategoryItem, MenuItem } from '@/types/cafe';

export const CAFE_CONFIG = {
  cafeName: '은혜 선교카페',
  bankName: process.env.NEXT_PUBLIC_CAFE_BANK_NAME || '카카오뱅크',
  accountNumber: process.env.NEXT_PUBLIC_CAFE_ACCOUNT_NUMBER || '3333-01-2345678',
  accountHolder: process.env.NEXT_PUBLIC_CAFE_ACCOUNT_HOLDER || '은혜교회선교카페',
  adminPin: process.env.NEXT_PUBLIC_ADMIN_PIN || '1234',
};

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'coffee', name: '커피 (Coffee)', is_visible: true },
  { id: 'non-coffee', name: '논커피 라떼', is_visible: true },
  { id: 'tea-ade', name: '티 & 에이드', is_visible: true },
  { id: 'dessert', name: '디저트', is_visible: true },
];

export const DEFAULT_CAFE_SETTINGS: CafeSettings = {
  cafe_name: CAFE_CONFIG.cafeName,
  bank_name: CAFE_CONFIG.bankName,
  account_number: CAFE_CONFIG.accountNumber,
  account_holder: CAFE_CONFIG.accountHolder,
  admin_pin: CAFE_CONFIG.adminPin,
  categories: DEFAULT_CATEGORIES,
  is_qr_order_enabled: true,
  qr_pause_message:
    '현재 예배 시간(또는 재료 준비 중)으로 모바일 QR 주문을 잠시 멈추었습니다. 잠시 후 다시 이용해 주세요!',
  allow_transfer: true,
  allow_cash: true,
};

export const CATEGORY_LABELS: Record<string, string> = {
  all: '전체 메뉴',
  coffee: '커피 (Coffee)',
  'non-coffee': '논커피 라떼',
  'tea-ade': '티 & 에이드',
  dessert: '디저트',
};

export function getCategoryLabel(
  categories: CategoryItem[] | undefined,
  categoryId: string
): string {
  if (categoryId === 'all') return '전체 메뉴';
  const found = (categories || DEFAULT_CATEGORIES).find(
    (c) => c.id === categoryId
  );
  return found ? found.name : CATEGORY_LABELS[categoryId] || categoryId;
}

export const INITIAL_SAMPLE_MENUS: MenuItem[] = [
  {
    id: 'menu-1',
    name: '아메리카노',
    category: 'coffee',
    price: 2000,
    has_temp_option: true,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 10,
  },
  {
    id: 'menu-2',
    name: '헤이즐넛 아메리카노',
    category: 'coffee',
    price: 2500,
    has_temp_option: true,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 20,
  },
  {
    id: 'menu-3',
    name: '카페라떼',
    category: 'coffee',
    price: 2500,
    has_temp_option: true,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 30,
  },
  {
    id: 'menu-4',
    name: '바닐라라떼',
    category: 'coffee',
    price: 3000,
    has_temp_option: true,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: true,
    is_visible: true,
    sort_order: 40,
  },
  {
    id: 'menu-5',
    name: '카라멜 마끼아또',
    category: 'coffee',
    price: 3000,
    has_temp_option: true,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 50,
  },
  {
    id: 'menu-6',
    name: '초코라떼',
    category: 'non-coffee',
    price: 2500,
    has_temp_option: true,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 60,
  },
  {
    id: 'menu-7',
    name: '고구마라떼',
    category: 'non-coffee',
    price: 3000,
    has_temp_option: true,
    default_temp: 'HOT',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 70,
  },
  {
    id: 'menu-8',
    name: '딸기라떼',
    category: 'non-coffee',
    price: 3000,
    has_temp_option: false,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: true,
    is_visible: true,
    sort_order: 80,
  },
  {
    id: 'menu-9',
    name: '복숭아 아이스티',
    category: 'tea-ade',
    price: 2000,
    has_temp_option: false,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 90,
  },
  {
    id: 'menu-10',
    name: '유자차',
    category: 'tea-ade',
    price: 2500,
    has_temp_option: true,
    default_temp: 'HOT',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 100,
  },
  {
    id: 'menu-11',
    name: '레몬에이드',
    category: 'tea-ade',
    price: 3000,
    has_temp_option: false,
    default_temp: 'ICE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 110,
  },
  {
    id: 'menu-12',
    name: '캐모마일 허브티',
    category: 'tea-ade',
    price: 2500,
    has_temp_option: true,
    default_temp: 'HOT',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 120,
  },
  {
    id: 'menu-13',
    name: '수제 쿠키',
    category: 'dessert',
    price: 1500,
    has_temp_option: false,
    default_temp: 'NONE',
    is_sold_out: false,
    is_new: false,
    is_visible: true,
    sort_order: 130,
  },
];

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

export function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}
