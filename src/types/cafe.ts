export type MenuCategory = string;

export type TempOption = 'HOT' | 'ICE' | 'NONE';

export type PaymentMethod = 'transfer' | 'cash';

/**
 * pending: 주문 접수됨 (확인 대기)
 * preparing: 제조 중 (수신 확인 및 음료 제조 시작)
 * ready: 제조 완료 (손님 스마트폰으로 픽업 호출 알람 발송)
 * completed: 전달 및 결제 완료 (최종 정산 반영)
 * cancelled: 주문 취소 (정산 제외)
 */
export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type OrderSource = 'qr' | 'pos';

export interface CategoryItem {
  id: string;
  name: string;
  is_visible?: boolean; // false일 경우 삭제하지 않고 손님/주문 화면에서만 일시 숨김
}

export interface CafeSettings {
  cafe_name: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  admin_pin: string;
  categories: CategoryItem[];
  is_qr_order_enabled?: boolean; // 예배 시간/브레이크 타임 모바일 QR 주문 일시 중지 여부
  qr_pause_message?: string; // 일시 중지 시 손님 화면에 보여줄 안내 문구
  allow_transfer?: boolean; // 계좌이체 결제수단 노출 여부
  allow_cash?: boolean; // 현금결제 결제수단 노출 여부
}

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  has_temp_option: boolean;
  default_temp: TempOption;
  is_sold_out: boolean;
  is_new: boolean;
  is_visible: boolean;
  sort_order: number;
  created_at?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_id: string | null;
  menu_name: string;
  temp_option: TempOption;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  phone: string; // 전체 휴대폰 번호 (예: 010-1234-5678)
  payment_method: PaymentMethod;
  status: OrderStatus;
  order_source: OrderSource;
  total_amount: number;
  created_at: string;
  completed_at?: string | null;
  items: OrderItem[];
}

export interface CartItem {
  cartKey: string; // `${menu.id}-${temp_option}`
  menu: MenuItem;
  temp_option: TempOption;
  quantity: number;
}

export interface CreateOrderInput {
  customer_name: string;
  phone: string;
  payment_method: PaymentMethod;
  order_source: OrderSource;
  items: {
    menu_id: string | null;
    menu_name: string;
    temp_option: TempOption;
    quantity: number;
    unit_price: number;
  }[];
}

export interface CreateMenuInput {
  name: string;
  category: MenuCategory;
  price: number;
  has_temp_option: boolean;
  default_temp: TempOption;
  is_new: boolean;
  is_visible?: boolean;
  is_sold_out?: boolean;
}
