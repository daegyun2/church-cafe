import {
  DEFAULT_CAFE_SETTINGS,
  DEFAULT_CATEGORIES,
  INITIAL_SAMPLE_MENUS,
} from '@/lib/config';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  CafeSettings,
  CategoryItem,
  CreateMenuInput,
  CreateOrderInput,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
} from '@/types/cafe';

const STORAGE_KEYS = {
  SETTINGS: 'church_cafe_settings_v1',
  MENUS: 'church_cafe_menus_v2',
  ORDERS: 'church_cafe_orders_v2',
  ORDER_SEQ: 'church_cafe_order_seq_v2',
};

const BROADCAST_CHANNEL_NAME = 'church_cafe_realtime_channel';

function getTodaySampleOrders(): Order[] {
  const now = new Date();
  const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  return [
    {
      id: 'sample-order-1',
      order_number: 101,
      customer_name: '김은혜',
      phone: '010-4821-1004',
      payment_method: 'transfer',
      status: 'completed',
      order_source: 'qr',
      total_amount: 6500,
      created_at: tenMinsAgo,
      completed_at: fiveMinsAgo,
      items: [
        {
          id: 'sample-item-1',
          order_id: 'sample-order-1',
          menu_id: 'menu-1',
          menu_name: '아메리카노',
          temp_option: 'ICE',
          quantity: 2,
          unit_price: 2000,
          subtotal: 4000,
        },
        {
          id: 'sample-item-2',
          order_id: 'sample-order-1',
          menu_id: 'menu-3',
          menu_name: '카페라떼',
          temp_option: 'HOT',
          quantity: 1,
          unit_price: 2500,
          subtotal: 2500,
        },
      ],
    },
    {
      id: 'sample-order-2',
      order_number: 102,
      customer_name: '박성민',
      phone: '010-7730-2580',
      payment_method: 'transfer',
      status: 'preparing',
      order_source: 'qr',
      total_amount: 5000,
      created_at: fiveMinsAgo,
      completed_at: null,
      items: [
        {
          id: 'sample-item-3',
          order_id: 'sample-order-2',
          menu_id: 'menu-4',
          menu_name: '바닐라라떼',
          temp_option: 'ICE',
          quantity: 1,
          unit_price: 3000,
          subtotal: 3000,
        },
        {
          id: 'sample-item-4',
          order_id: 'sample-order-2',
          menu_id: 'menu-9',
          menu_name: '복숭아 아이스티',
          temp_option: 'ICE',
          quantity: 1,
          unit_price: 2000,
          subtotal: 2000,
        },
      ],
    },
    {
      id: 'sample-order-3',
      order_number: 103,
      customer_name: '이정숙 권사',
      phone: '010-1904-8821',
      payment_method: 'cash',
      status: 'pending',
      order_source: 'pos',
      total_amount: 5000,
      created_at: twoMinsAgo,
      completed_at: null,
      items: [
        {
          id: 'sample-item-5',
          order_id: 'sample-order-3',
          menu_id: 'menu-10',
          menu_name: '유자차',
          temp_option: 'HOT',
          quantity: 2,
          unit_price: 2500,
          subtotal: 5000,
        },
      ],
    },
  ];
}

function notifyLocalChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cafe-local-update'));
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bc.postMessage({ type: 'SYNC', timestamp: Date.now() });
    bc.close();
  } catch {
    // Ignore BroadcastChannel errors on unsupported environments
  }
}

// ============================================================================
// 로컬 스토리지 헬퍼 (Supabase 미설정 시 자동 폴백)
// ============================================================================
function getLocalSettings(): CafeSettings {
  if (typeof window === 'undefined') return DEFAULT_CAFE_SETTINGS;
  const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!raw) {
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify(DEFAULT_CAFE_SETTINGS)
    );
    return DEFAULT_CAFE_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CafeSettings>;
    return {
      ...DEFAULT_CAFE_SETTINGS,
      ...parsed,
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : DEFAULT_CATEGORIES,
    };
  } catch {
    return DEFAULT_CAFE_SETTINGS;
  }
}

function saveLocalSettings(settings: CafeSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  notifyLocalChange();
}

function getLocalMenus(): MenuItem[] {
  if (typeof window === 'undefined') return INITIAL_SAMPLE_MENUS;
  const raw = localStorage.getItem(STORAGE_KEYS.MENUS);
  if (!raw) {
    localStorage.setItem(STORAGE_KEYS.MENUS, JSON.stringify(INITIAL_SAMPLE_MENUS));
    return INITIAL_SAMPLE_MENUS;
  }
  try {
    return JSON.parse(raw) as MenuItem[];
  } catch {
    return INITIAL_SAMPLE_MENUS;
  }
}

function saveLocalMenus(menus: MenuItem[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.MENUS, JSON.stringify(menus));
  notifyLocalChange();
}

function getLocalOrders(): Order[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
  if (!raw) {
    const initial = getTodaySampleOrders();
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(initial));
    localStorage.setItem(STORAGE_KEYS.ORDER_SEQ, '103');
    return initial;
  }
  try {
    return JSON.parse(raw) as Order[];
  } catch {
    return [];
  }
}

function saveLocalOrders(orders: Order[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  notifyLocalChange();
}

function getNextLocalOrderNumber(): number {
  if (typeof window === 'undefined') return 101;
  const current = parseInt(localStorage.getItem(STORAGE_KEYS.ORDER_SEQ) || '103', 10);
  const next = current + 1;
  localStorage.setItem(STORAGE_KEYS.ORDER_SEQ, String(next));
  return next;
}

// ============================================================================
// 통합 카페 설정 API (카페명, 은행명, 계좌번호, 예금주, 정산 4자리 PIN)
// ============================================================================

export async function fetchCafeSettings(): Promise<CafeSettings> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('cafe_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    if (error || !data) {
      return getLocalSettings();
    }
    const rawCats = data.categories as CategoryItem[] | undefined;
    return {
      cafe_name: (data.cafe_name as string) || DEFAULT_CAFE_SETTINGS.cafe_name,
      bank_name: (data.bank_name as string) || DEFAULT_CAFE_SETTINGS.bank_name,
      account_number:
        (data.account_number as string) || DEFAULT_CAFE_SETTINGS.account_number,
      account_holder:
        (data.account_holder as string) || DEFAULT_CAFE_SETTINGS.account_holder,
      admin_pin: (data.admin_pin as string) || DEFAULT_CAFE_SETTINGS.admin_pin,
      categories:
        Array.isArray(rawCats) && rawCats.length > 0
          ? rawCats
          : DEFAULT_CATEGORIES,
      is_qr_order_enabled:
        typeof data.is_qr_order_enabled === 'boolean'
          ? data.is_qr_order_enabled
          : true,
      qr_pause_message:
        (data.qr_pause_message as string) ||
        DEFAULT_CAFE_SETTINGS.qr_pause_message,
      allow_transfer:
        typeof data.allow_transfer === 'boolean' ? data.allow_transfer : true,
      allow_cash: typeof data.allow_cash === 'boolean' ? data.allow_cash : true,
    };
  }
  return getLocalSettings();
}

export async function updateCafeSettings(
  settings: CafeSettings
): Promise<CafeSettings> {
  const validCategories =
    Array.isArray(settings.categories) && settings.categories.length > 0
      ? settings.categories
      : DEFAULT_CATEGORIES;

  const sanitized: CafeSettings = {
    cafe_name: settings.cafe_name.trim() || DEFAULT_CAFE_SETTINGS.cafe_name,
    bank_name: settings.bank_name.trim() || DEFAULT_CAFE_SETTINGS.bank_name,
    account_number:
      settings.account_number.trim() || DEFAULT_CAFE_SETTINGS.account_number,
    account_holder:
      settings.account_holder.trim() || DEFAULT_CAFE_SETTINGS.account_holder,
    admin_pin:
      settings.admin_pin.replace(/\D/g, '').slice(0, 4) ||
      DEFAULT_CAFE_SETTINGS.admin_pin,
    categories: validCategories,
    is_qr_order_enabled: settings.is_qr_order_enabled ?? true,
    qr_pause_message:
      settings.qr_pause_message?.trim() ||
      DEFAULT_CAFE_SETTINGS.qr_pause_message,
    allow_transfer: settings.allow_transfer ?? true,
    allow_cash: settings.allow_cash ?? true,
  };

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('cafe_settings').upsert({
      id: 'default',
      ...sanitized,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return sanitized;
  }

  saveLocalSettings(sanitized);
  return sanitized;
}

// ============================================================================
// 통합 메뉴 & 주문 API (Supabase + Local Fallback)
// ============================================================================

export async function fetchMenus(): Promise<MenuItem[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('menus')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase fetchMenus error:', error);
      return getLocalMenus();
    }
    return (data || []) as MenuItem[];
  }
  return getLocalMenus().sort((a, b) => a.sort_order - b.sort_order);
}

export async function toggleMenuSoldOut(menuId: string, isSoldOut: boolean): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('menus')
      .update({ is_sold_out: isSoldOut, updated_at: new Date().toISOString() })
      .eq('id', menuId);
    if (error) throw error;
    return;
  }

  const menus = getLocalMenus().map((m) =>
    m.id === menuId ? { ...m, is_sold_out: isSoldOut } : m
  );
  saveLocalMenus(menus);
}

export async function createMenu(input: CreateMenuInput): Promise<MenuItem> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('menus')
      .insert({
        name: input.name,
        category: input.category,
        price: input.price,
        has_temp_option: input.has_temp_option,
        default_temp: input.default_temp,
        is_new: input.is_new,
        is_visible: input.is_visible ?? true,
        is_sold_out: input.is_sold_out ?? false,
        sort_order: 999,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as MenuItem;
  }

  const menus = getLocalMenus();
  const maxSort = menus.reduce((max, m) => Math.max(max, m.sort_order), 0);
  const newMenu: MenuItem = {
    id: `menu-${Date.now()}`,
    name: input.name,
    category: input.category,
    price: input.price,
    has_temp_option: input.has_temp_option,
    default_temp: input.default_temp,
    is_sold_out: input.is_sold_out ?? false,
    is_new: input.is_new,
    is_visible: input.is_visible ?? true,
    sort_order: maxSort + 10,
    created_at: new Date().toISOString(),
  };
  saveLocalMenus([...menus, newMenu]);
  return newMenu;
}

export async function updateMenu(
  menuId: string,
  updates: Partial<Omit<MenuItem, 'id' | 'created_at'>>
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('menus')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', menuId);
    if (error) throw error;
    return;
  }

  const menus = getLocalMenus().map((m) => (m.id === menuId ? { ...m, ...updates } : m));
  saveLocalMenus(menus);
}

export async function deleteMenu(menuId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('menus').delete().eq('id', menuId);
    if (error) throw error;
    return;
  }

  const menus = getLocalMenus().filter((m) => m.id !== menuId);
  saveLocalMenus(menus);
}

function mapRowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    order_number: row.order_number as number,
    customer_name: row.customer_name as string,
    phone: (row.phone as string) || (row.phone_last4 as string) || '',
    payment_method: row.payment_method as Order['payment_method'],
    status: row.status as Order['status'],
    order_source: row.order_source as Order['order_source'],
    total_amount: row.total_amount as number,
    created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
    items: ((row.order_items as OrderItem[]) || []).sort((a, b) =>
      a.menu_name.localeCompare(b.menu_name)
    ),
  };
}

export async function fetchTodayOrders(): Promise<Order[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase fetchTodayOrders error:', error);
      return getLocalOrders();
    }

    return (data || []).map((row) => mapRowToOrder(row as Record<string, unknown>));
  }

  const orders = getLocalOrders();
  return orders.filter((o) => new Date(o.created_at) >= startOfDay);
}

export async function fetchOrderById(orderId: string): Promise<Order | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (error || !data) return null;
    return mapRowToOrder(data as Record<string, unknown>);
  }

  const orders = getLocalOrders();
  return orders.find((o) => o.id === orderId) || null;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const totalAmount = input.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  if (isSupabaseConfigured && supabase) {
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: input.customer_name.trim(),
        phone: input.phone.trim(),
        payment_method: input.payment_method,
        status: 'pending',
        order_source: input.order_source,
        total_amount: totalAmount,
      })
      .select('*')
      .single();

    if (orderError) throw orderError;

    const itemsPayload = input.items.map((item) => ({
      order_id: orderData.id,
      menu_id: item.menu_id,
      menu_name: item.menu_name,
      temp_option: item.temp_option,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.unit_price * item.quantity,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsPayload)
      .select('*');

    if (itemsError) throw itemsError;

    return {
      ...(orderData as Omit<Order, 'items'>),
      items: (insertedItems || []) as OrderItem[],
    };
  }

  const orderId = `order-${Date.now()}`;
  const orderNumber = getNextLocalOrderNumber();
  const orderItems: OrderItem[] = input.items.map((item, idx) => ({
    id: `item-${Date.now()}-${idx}`,
    order_id: orderId,
    menu_id: item.menu_id,
    menu_name: item.menu_name,
    temp_option: item.temp_option,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.unit_price * item.quantity,
  }));

  const newOrder: Order = {
    id: orderId,
    order_number: orderNumber,
    customer_name: input.customer_name.trim(),
    phone: input.phone.trim(),
    payment_method: input.payment_method,
    status: 'pending',
    order_source: input.order_source,
    total_amount: totalAmount,
    created_at: new Date().toISOString(),
    completed_at: null,
    items: orderItems,
  };

  const orders = getLocalOrders();
  saveLocalOrders([...orders, newOrder]);
  return newOrder;
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const completedAt = status === 'completed' ? new Date().toISOString() : null;

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('orders')
      .update({
        status,
        completed_at: completedAt,
      })
      .eq('id', orderId);
    if (error) throw error;
    return;
  }

  const orders = getLocalOrders().map((order) =>
    order.id === orderId
      ? {
          ...order,
          status,
          completed_at: completedAt,
        }
      : order
  );
  saveLocalOrders(orders);
}

export async function updateOrderDetails(
  orderId: string,
  updates: {
    payment_method: Order['payment_method'];
    customer_name?: string;
    phone?: string;
    items: {
      menu_id: string | null;
      menu_name: string;
      temp_option: OrderItem['temp_option'];
      quantity: number;
      unit_price: number;
    }[];
  }
): Promise<void> {
  const newTotalAmount = updates.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  if (isSupabaseConfigured && supabase) {
    const { error: delError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);
    if (delError) throw delError;

    const newItemsPayload = updates.items.map((item) => ({
      order_id: orderId,
      menu_id: item.menu_id,
      menu_name: item.menu_name,
      temp_option: item.temp_option,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.unit_price * item.quantity,
    }));

    const { error: insError } = await supabase.from('order_items').insert(newItemsPayload);
    if (insError) throw insError;

    const orderPatch: Record<string, unknown> = {
      payment_method: updates.payment_method,
      total_amount: newTotalAmount,
    };
    if (updates.customer_name) orderPatch.customer_name = updates.customer_name;
    if (updates.phone) orderPatch.phone = updates.phone;

    const { error: updError } = await supabase
      .from('orders')
      .update(orderPatch)
      .eq('id', orderId);
    if (updError) throw updError;
    return;
  }

  const orders = getLocalOrders().map((order) => {
    if (order.id !== orderId) return order;
    const newItems: OrderItem[] = updates.items.map((item, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      order_id: orderId,
      menu_id: item.menu_id,
      menu_name: item.menu_name,
      temp_option: item.temp_option,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.unit_price * item.quantity,
    }));

    return {
      ...order,
      payment_method: updates.payment_method,
      customer_name: updates.customer_name ?? order.customer_name,
      phone: updates.phone ?? order.phone,
      total_amount: newTotalAmount,
      items: newItems,
    };
  });
  saveLocalOrders(orders);
}

export async function clearOrderRecords(
  mode: 'completed_cancelled' | 'all' = 'completed_cancelled'
): Promise<number> {
  if (isSupabaseConfigured && supabase) {
    if (mode === 'all') {
      // 모든 주문 삭제 (order_items는 ON DELETE CASCADE로 함께 삭제됨)
      const { data, error } = await supabase
        .from('orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select('id');
      if (error) throw error;
      return (data || []).length;
    } else {
      const { data, error } = await supabase
        .from('orders')
        .delete()
        .in('status', ['completed', 'cancelled'])
        .select('id');
      if (error) throw error;
      return (data || []).length;
    }
  }

  const currentOrders = getLocalOrders();
  if (mode === 'all') {
    const deletedCount = currentOrders.length;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.ORDER_SEQ, '100');
      notifyLocalChange();
    }
    return deletedCount;
  } else {
    const remaining = currentOrders.filter(
      (o) => o.status !== 'completed' && o.status !== 'cancelled'
    );
    const deletedCount = currentOrders.length - remaining.length;
    saveLocalOrders(remaining);
    return deletedCount;
  }
}

export function subscribeCafeRealtime(onDataChange: () => void): () => void {
  if (isSupabaseConfigured && supabase) {
    const client = supabase;
    const channel = client
      .channel(`cafe-realtime-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cafe_settings' },
        () => onDataChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menus' },
        () => onDataChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => onDataChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => onDataChange()
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }

  if (typeof window === 'undefined') return () => {};

  const handleLocal = () => onDataChange();
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEYS.SETTINGS ||
      e.key === STORAGE_KEYS.MENUS ||
      e.key === STORAGE_KEYS.ORDERS ||
      e.key === null
    ) {
      onDataChange();
    }
  };

  window.addEventListener('cafe-local-update', handleLocal);
  window.addEventListener('storage', handleStorage);

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bc.onmessage = () => onDataChange();
  } catch {
    // Ignore
  }

  return () => {
    window.removeEventListener('cafe-local-update', handleLocal);
    window.removeEventListener('storage', handleStorage);
    if (bc) bc.close();
  };
}
