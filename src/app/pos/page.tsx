'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  DEFAULT_CAFE_SETTINGS,
  formatCurrency,
  formatPhoneNumber,
} from '@/lib/config';
import {
  createMenu,
  createOrder,
  deleteMenu,
  fetchCafeSettings,
  fetchMenus,
  fetchTodayOrders,
  subscribeCafeRealtime,
  toggleMenuSoldOut,
  updateCafeSettings,
  updateMenu,
  updateOrderDetails,
  updateOrderStatus,
} from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  CafeSettings,
  CartItem,
  MenuCategory,
  MenuItem,
  Order,
  OrderStatus,
  PaymentMethod,
  TempOption,
} from '@/types/cafe';
import CancelConfirmModal from '@/components/pos/CancelConfirmModal';
import MenuManageModal from '@/components/pos/MenuManageModal';
import OrderEditModal from '@/components/pos/OrderEditModal';
import {
  BarChart3,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Coffee,
  Edit3,
  ExternalLink,
  Flame,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Snowflake,
  Square,
  Trash2,
  UserPlus,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';

export default function CounterPosPage() {
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(
    DEFAULT_CAFE_SETTINGS
  );
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedCat, setSelectedCat] = useState<MenuCategory | 'all'>('all');

  // 좌측 카운터 직접 주문 상태
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('010-');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // 우측 대기열 필터 탭 ('active' | 'completed' | 'cancelled')
  const [queueTab, setQueueTab] = useState<'active' | 'completed' | 'cancelled'>(
    'active'
  );
  // 주문 카드 크기 조절 ('compact': 작게 모아보기 | 'normal': 보통 | 'large': 크게 확대)
  const [cardScale, setCardScale] = useState<'compact' | 'normal' | 'large'>(
    'normal'
  );
  // 주문 일괄 선택(체크박스 & 드래그) 및 일괄 상태 변경
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragSelectTargetState, setDragSelectTargetState] = useState(true);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // 모달 상태
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [manageModalTab, setManageModalTab] = useState<
    'menus' | 'settings' | null
  >(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedScale = localStorage.getItem('church_cafe_pos_card_scale');
      if (
        savedScale === 'compact' ||
        savedScale === 'normal' ||
        savedScale === 'large'
      ) {
        setCardScale(savedScale);
      }
    }
  }, []);

  const handleChangeCardScale = (scale: 'compact' | 'normal' | 'large') => {
    setCardScale(scale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('church_cafe_pos_card_scale', scale);
    }
  };

  const loadAllData = useCallback(async () => {
    const [settingsData, menuList, todayOrders] = await Promise.all([
      fetchCafeSettings(),
      fetchMenus(),
      fetchTodayOrders(),
    ]);
    setCafeSettings(settingsData);
    setMenus(menuList);
    setOrders(todayOrders);
  }, []);

  useEffect(() => {
    loadAllData();
    const unsubscribe = subscribeCafeRealtime(() => {
      loadAllData();
    });
    return () => unsubscribe();
  }, [loadAllData]);

  const visibleCategories = cafeSettings.categories.filter(
    (c) => c.is_visible !== false
  );
  const visibleCatIds = new Set(visibleCategories.map((c) => c.id));

  const visibleMenus = menus.filter(
    (m) =>
      m.is_visible &&
      visibleCatIds.has(m.category) &&
      (selectedCat === 'all' || m.category === selectedCat)
  );

  const addMenuToPosCart = (menu: MenuItem, temp: TempOption) => {
    if (menu.is_sold_out) return;
    const finalTemp: TempOption = menu.has_temp_option ? temp : menu.default_temp;
    const cartKey = `${menu.id}-${finalTemp}`;

    setPosCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === cartKey);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: updated[idx].quantity + 1,
        };
        return updated;
      }
      return [
        ...prev,
        {
          cartKey,
          menu,
          temp_option: finalTemp,
          quantity: 1,
        },
      ];
    });
  };

  const updatePosCartQty = (cartKey: string, delta: number) => {
    setPosCart((prev) =>
      prev
        .map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const posTotalAmount = posCart.reduce(
    (sum, item) => sum + item.menu.price * item.quantity,
    0
  );

  const handleCreatePosOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posCart.length === 0) {
      alert('주문할 메뉴를 먼저 선택해 주세요.');
      return;
    }
    const finalName = customerName.trim() || '현장손님';
    const digits = phone.replace(/\D/g, '');
    const finalPhone =
      digits.length >= 10 ? formatPhoneNumber(phone) : '010-0000-0000';

    setSubmittingOrder(true);
    try {
      await createOrder({
        customer_name: finalName,
        phone: finalPhone,
        payment_method: paymentMethod,
        order_source: 'pos',
        items: posCart.map((c) => ({
          menu_id: c.menu.id,
          menu_name: c.menu.name,
          temp_option: c.temp_option,
          quantity: c.quantity,
          unit_price: c.menu.price,
        })),
      });
      setPosCart([]);
      setCustomerName('');
      setPhone('010-');
      setQueueTab('active');
      await loadAllData();
    } catch (err) {
      console.error(err);
      alert('카운터 주문 생성 중 오류가 발생했습니다.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // 진행 중 대기열: pending(접수) + preparing(제조중) + ready(제조완료/호출됨)
  const activeOrders = orders.filter(
    (o) =>
      o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'
  );
  const completedOrders = orders
    .filter((o) => o.status === 'completed')
    .slice()
    .reverse();
  const cancelledOrders = orders
    .filter((o) => o.status === 'cancelled')
    .slice()
    .reverse();

  const displayedOrders =
    queueTab === 'active'
      ? activeOrders
      : queueTab === 'completed'
        ? completedOrders
        : cancelledOrders;

  const displayedOrderIds = displayedOrders.map((o) => o.id);
  const validSelectedIds = selectedOrderIds.filter((id) =>
    displayedOrderIds.includes(id)
  );
  const isAllDisplayedSelected =
    displayedOrders.length > 0 &&
    validSelectedIds.length === displayedOrders.length;

  useEffect(() => {
    const stopDrag = () => setIsDragSelecting(false);
    window.addEventListener('pointerup', stopDrag);
    return () => window.removeEventListener('pointerup', stopDrag);
  }, []);

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllDisplayedSelected) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(displayedOrderIds);
    }
  };

  const handleBulkUpdateStatus = async (targetStatus: OrderStatus) => {
    if (validSelectedIds.length === 0 || bulkUpdating) return;
    if (
      targetStatus === 'cancelled' &&
      !window.confirm(
        `선택한 ${validSelectedIds.length}건의 주문을 일괄 취소하시겠습니까?`
      )
    ) {
      return;
    }

    setBulkUpdating(true);
    try {
      for (const id of validSelectedIds) {
        await updateOrderStatus(id, targetStatus);
      }
      setSelectedOrderIds([]);
      await loadAllData();
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F2F4F6] text-[#191F28]">
      {/* 상단 POS 헤더 바 (Toss 스타일 깔끔한 화이트 헤더) */}
      <header className="flex shrink-0 items-center justify-between border-b border-[#E5E8EB] bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-2xl bg-[#3182F6] px-3.5 py-2 text-sm font-extrabold text-white shadow-2xs transition hover:bg-[#1B64DA]"
          >
            <Coffee className="h-4 w-4" />
            {cafeSettings.cafe_name} POS
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8FAF0] px-3 py-1.5 text-xs font-extrabold text-[#00A859]">
            <Wifi className="h-3.5 w-3.5" />
            {isSupabaseConfigured ? '실시간 주문 연결됨' : '기기 내부 모드'}
          </span>

          <span className="hidden text-xs font-semibold text-[#8B95A1] xl:inline">
            입금계좌: {cafeSettings.bank_name} {cafeSettings.account_number} (
            {cafeSettings.account_holder})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 원터치 QR 주문 열림 / 일시중지(예배시간·준비중) 토글 버튼 */}
          <button
            type="button"
            onClick={async () => {
              const nextState = cafeSettings.is_qr_order_enabled === false;
              await updateCafeSettings({
                ...cafeSettings,
                is_qr_order_enabled: nextState,
              });
              await loadAllData();
            }}
            title="클릭하여 손님 모바일 QR 주문 접수를 잠시 멈추거나 다시 엽니다"
            className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-extrabold transition ${
              cafeSettings.is_qr_order_enabled !== false
                ? 'bg-[#E8FAF0] text-[#00A859] hover:bg-[#D1F5E1]'
                : 'animate-pulse bg-[#F04452] text-white shadow-xs hover:bg-[#D9303E]'
            }`}
          >
            {cafeSettings.is_qr_order_enabled !== false
              ? '🟢 QR주문 열림'
              : '⏸️ QR주문 일시중지됨'}
          </button>

          <button
            type="button"
            onClick={() => setManageModalTab('menus')}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E8F3FF] px-3.5 py-2 text-xs font-extrabold text-[#3182F6] transition hover:bg-[#D4E8FF]"
          >
            <Settings2 className="h-4 w-4" />
            메뉴 · 가격 · 품절 관리
            {menus.some((m) => m.is_sold_out) && (
              <span className="rounded-full bg-[#F04452] px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                품절 {menus.filter((m) => m.is_sold_out).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setManageModalTab('settings')}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F2F4F6] px-3.5 py-2 text-xs font-extrabold text-[#4E5968] transition hover:bg-[#E5E8EB]"
          >
            <Building2 className="h-4 w-4" />
            카페 · 계좌 · PIN 설정
          </button>

          <Link
            href="/order"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F2F4F6] px-3 py-2 text-xs font-bold text-[#4E5968] hover:bg-[#E5E8EB]"
          >
            손님 QR화면
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[#191F28] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#333D4B]"
          >
            <BarChart3 className="h-4 w-4" />
            일일 정산
          </Link>
        </div>
      </header>

      {/* 메인 분할 레이아웃 */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
        {/* ==================================================================
            [좌측 영역 - 5 cols] 카운터 직접 주문 입력 패드
        ================================================================== */}
        <section className="flex flex-col overflow-hidden border-r border-[#E5E8EB] bg-white lg:col-span-5">
          <div className="border-b border-[#F2F4F6] px-4 pt-3.5 pb-2.5">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-[#191F28]">
                <UserPlus className="h-4 w-4 text-[#3182F6]" />
                카운터 직접 주문 접수
              </h2>
              {posCart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPosCart([])}
                  className="text-xs font-bold text-[#F04452] hover:underline"
                >
                  선택 초기화
                </button>
              )}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCat('all')}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                  selectedCat === 'all'
                    ? 'bg-[#191F28] text-white'
                    : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
                }`}
              >
                전체 메뉴
              </button>
              {visibleCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCat(cat.id)}
                  className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                    selectedCat === cat.id
                      ? 'bg-[#191F28] text-white'
                      : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* 메뉴 그리드 */}
          <div className="flex-1 overflow-y-auto bg-[#F9FAFB] p-3.5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {visibleMenus.map((menu) => {
                const isSoldOut = menu.is_sold_out;
                return (
                  <div
                    key={menu.id}
                    className={`flex flex-col justify-between rounded-2xl border p-3.5 transition ${
                      isSoldOut
                        ? 'border-[#E5E8EB] bg-[#F2F4F6] opacity-60'
                        : 'border-[#E5E8EB]/80 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:border-[#3182F6]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={`text-sm font-extrabold leading-snug ${
                            isSoldOut
                              ? 'line-through text-[#8B95A1]'
                              : 'text-[#191F28]'
                          }`}
                        >
                          {menu.name}
                        </span>
                        {menu.is_new && !isSoldOut && (
                          <span className="shrink-0 rounded-md bg-[#E8F3FF] px-1.5 py-0.5 text-[9px] font-black text-[#3182F6]">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-bold text-[#4E5968]">
                        {formatCurrency(menu.price)}
                      </p>
                    </div>

                    <div className="mt-3">
                      {isSoldOut ? (
                        <div className="w-full rounded-xl bg-[#FFEEEE] py-1.5 text-center text-xs font-extrabold text-[#F04452]">
                          품절됨
                        </div>
                      ) : menu.has_temp_option ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => addMenuToPosCart(menu, 'ICE')}
                            className="flex items-center justify-center gap-1 rounded-xl bg-[#E8F3FF] py-2 text-xs font-extrabold text-[#3182F6] transition hover:bg-[#3182F6] hover:text-white active:scale-95"
                          >
                            <Snowflake className="h-3 w-3" /> ICE
                          </button>
                          <button
                            type="button"
                            onClick={() => addMenuToPosCart(menu, 'HOT')}
                            className="flex items-center justify-center gap-1 rounded-xl bg-[#FFEEEE] py-2 text-xs font-extrabold text-[#F04452] transition hover:bg-[#F04452] hover:text-white active:scale-95"
                          >
                            <Flame className="h-3 w-3" /> HOT
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            addMenuToPosCart(menu, menu.default_temp)
                          }
                          className="w-full rounded-xl bg-[#F2F4F6] py-2 text-xs font-extrabold text-[#191F28] transition hover:bg-[#3182F6] hover:text-white active:scale-95"
                        >
                          + 담기 (
                          {menu.default_temp === 'NONE'
                            ? '단품'
                            : menu.default_temp}
                          )
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 좌측 하단: 담긴 메뉴 & 이름/전체 휴대폰번호/결제방식 입력 */}
          <form
            onSubmit={handleCreatePosOrder}
            className="border-t border-[#E5E8EB] bg-white p-4"
          >
            {posCart.length > 0 ? (
              <div className="mb-3 max-h-32 space-y-1.5 overflow-y-auto rounded-2xl bg-[#F2F4F6] p-3">
                {posCart.map((item) => (
                  <div
                    key={item.cartKey}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-[#191F28]">
                        {item.menu.name}
                      </span>
                      {item.temp_option !== 'NONE' && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                            item.temp_option === 'HOT'
                              ? 'bg-[#FFEEEE] text-[#F04452]'
                              : 'bg-[#E8F3FF] text-[#3182F6]'
                          }`}
                        >
                          {item.temp_option}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg bg-white shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updatePosCartQty(item.cartKey, -1)}
                          className="px-1.5 py-1 text-[#4E5968] hover:text-[#191F28]"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center font-black text-[#191F28]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updatePosCartQty(item.cartKey, 1)}
                          className="px-1.5 py-1 text-[#4E5968] hover:text-[#191F28]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="w-14 text-right font-bold text-[#191F28]">
                        {formatCurrency(item.menu.price * item.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updatePosCartQty(item.cartKey, -item.quantity)
                        }
                        className="text-[#F04452]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-3 rounded-2xl bg-[#F2F4F6] py-3 text-center text-xs font-semibold text-[#8B95A1]">
                위 메뉴를 터치하면 여기에 담깁니다
              </div>
            )}

            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3">
                <input
                  type="text"
                  required
                  placeholder="주문자 이름"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-2.5 text-xs font-bold text-[#191F28] focus:border-[#3182F6] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="col-span-5">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={13}
                  required
                  placeholder="010-1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                  className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-2.5 text-xs font-black tracking-wide text-[#191F28] focus:border-[#3182F6] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="col-span-4 grid grid-cols-2 gap-1 rounded-xl bg-[#F2F4F6] p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`rounded-lg py-1.5 text-xs font-extrabold transition ${
                    paymentMethod === 'cash'
                      ? 'bg-white text-[#191F28] shadow-2xs'
                      : 'text-[#8B95A1]'
                  }`}
                >
                  현금
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`rounded-lg py-1.5 text-xs font-extrabold transition ${
                    paymentMethod === 'transfer'
                      ? 'bg-[#3182F6] text-white shadow-2xs'
                      : 'text-[#8B95A1]'
                  }`}
                >
                  계좌이체
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingOrder || posCart.length === 0}
              className="mt-2.5 flex w-full items-center justify-between rounded-2xl bg-[#3182F6] px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#1B64DA] disabled:cursor-not-allowed disabled:bg-[#E5E8EB] disabled:text-[#8B95A1]"
            >
              <span>
                카운터 주문 접수 ({posCart.reduce((s, i) => s + i.quantity, 0)}
                잔/개)
              </span>
              <span className="text-base font-black text-white">
                {formatCurrency(posTotalAmount)}
              </span>
            </button>
          </form>
        </section>

        {/* ==================================================================
            [우측 영역 - 7 cols] 실시간 주문 대기열 & 손님 알림 전송
        ================================================================== */}
        <section className="flex flex-col overflow-hidden bg-[#F2F4F6] lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E8EB] bg-white px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-2xl bg-[#F2F4F6] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setQueueTab('active');
                    setSelectedOrderIds([]);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                    queueTab === 'active'
                      ? 'bg-white text-[#191F28] shadow-2xs'
                      : 'text-[#8B95A1] hover:text-[#4E5968]'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 text-[#3182F6]" />
                  대기열
                  <span className="rounded-full bg-[#3182F6] px-2 py-0.5 text-[11px] font-black text-white">
                    {activeOrders.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQueueTab('completed');
                    setSelectedOrderIds([]);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                    queueTab === 'completed'
                      ? 'bg-white text-[#00A859] shadow-2xs'
                      : 'text-[#8B95A1] hover:text-[#4E5968]'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  완료됨 ({completedOrders.length})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQueueTab('cancelled');
                    setSelectedOrderIds([]);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                    queueTab === 'cancelled'
                      ? 'bg-white text-[#F04452] shadow-2xs'
                      : 'text-[#8B95A1] hover:text-[#4E5968]'
                  }`}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  취소됨 ({cancelledOrders.length})
                </button>
              </div>

              {displayedOrders.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className={`inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-extrabold transition ${
                    isAllDisplayedSelected
                      ? 'bg-[#E8F3FF] text-[#3182F6]'
                      : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
                  }`}
                >
                  {isAllDisplayedSelected ? (
                    <CheckSquare className="h-3.5 w-3.5 text-[#3182F6]" />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-[#8B95A1]" />
                  )}
                  {isAllDisplayedSelected ? '전체 해제' : '전체 선택'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* 주문 카드 크기 조절 스위치 */}
              <div className="flex items-center gap-1 rounded-2xl bg-[#F2F4F6] p-1">
                <span className="px-2 text-[11px] font-bold text-[#8B95A1]">
                  크기
                </span>
                {(
                  [
                    { key: 'compact', label: '작게' },
                    { key: 'normal', label: '보통' },
                    { key: 'large', label: '크게' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleChangeCardScale(opt.key)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-extrabold transition ${
                      cardScale === opt.key
                        ? 'bg-white text-[#3182F6] shadow-2xs'
                        : 'text-[#8B95A1] hover:text-[#4E5968]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="hidden text-right text-xs font-bold text-[#4E5968] sm:block">
                오늘 누적:{' '}
                <strong className="text-[#3182F6]">
                  {formatCurrency(
                    completedOrders.reduce((s, o) => s + o.total_amount, 0)
                  )}
                </strong>
              </div>
            </div>
          </div>

          {/* 선택된 주문이 있을 때 나타나는 상단 고정 일괄 처리 액션 바 (Toss Floating Bar 톤) */}
          {validSelectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#3182F6]/20 bg-[#191F28] px-5 py-3 text-white shadow-md">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-[#3182F6] px-2.5 py-1 text-xs font-extrabold text-white">
                  {validSelectedIds.length}건 선택됨
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  {displayedOrders
                    .filter((o) => validSelectedIds.includes(o.id))
                    .map((o) => `#${o.order_number}`)
                    .join(', ')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {queueTab === 'active' ? (
                  <>
                    <button
                      type="button"
                      disabled={bulkUpdating}
                      onClick={() => handleBulkUpdateStatus('preparing')}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#F59E0B] px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#D97706] disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      일괄 제조중
                    </button>
                    <button
                      type="button"
                      disabled={bulkUpdating}
                      onClick={() => handleBulkUpdateStatus('ready')}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#3182F6] px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#1B64DA] disabled:opacity-50"
                    >
                      <BellRing className="h-3.5 w-3.5" />
                      일괄 완료·호출
                    </button>
                    <button
                      type="button"
                      disabled={bulkUpdating}
                      onClick={() => handleBulkUpdateStatus('completed')}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#00C471] px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-[#00A859] disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      일괄 전달완료
                    </button>
                    <button
                      type="button"
                      disabled={bulkUpdating}
                      onClick={() => handleBulkUpdateStatus('cancelled')}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#F04452]/20 px-2.5 py-2 text-xs font-extrabold text-[#FF8A93] transition hover:bg-[#F04452]/30 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      일괄 취소
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={bulkUpdating}
                    onClick={() => handleBulkUpdateStatus('pending')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#3182F6] px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-[#1B64DA] disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    선택 주문 일괄 대기열로 복구
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedOrderIds([])}
                  className="ml-1 inline-flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-2 text-xs font-bold text-slate-200 hover:bg-white/20"
                >
                  <X className="h-3.5 w-3.5" />
                  해제
                </button>
              </div>
            </div>
          )}

          {/* 대기열 카드 리스트 */}
          <div className="flex-1 overflow-y-auto p-4 select-none">
            {displayedOrders.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-[28px] bg-white p-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#F2F4F6] text-[#8B95A1]">
                  <Coffee className="h-8 w-8" />
                </div>
                <p className="mt-4 text-base font-extrabold text-[#4E5968]">
                  {queueTab === 'active'
                    ? '현재 대기 중인 주문이 없어요'
                    : queueTab === 'completed'
                      ? '아직 완료된 주문이 없어요'
                      : '취소된 주문이 없어요'}
                </p>
                <p className="mt-1 text-xs font-medium text-[#8B95A1]">
                  손님이 QR로 주문하거나 좌측 패드에서 주문을 넣으면 바로 나타납니다
                </p>
              </div>
            ) : (
              <div
                className={`grid ${
                  cardScale === 'compact'
                    ? 'grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'
                    : cardScale === 'large'
                      ? 'grid-cols-1 gap-5'
                      : 'grid-cols-1 gap-4 xl:grid-cols-2'
                }`}
              >
                {displayedOrders.map((order) => {
                  const totalCups = order.items.reduce(
                    (sum, i) => sum + i.quantity,
                    0
                  );
                  const orderTime = new Date(
                    order.created_at
                  ).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const isActive =
                    order.status === 'pending' ||
                    order.status === 'preparing' ||
                    order.status === 'ready';
                  const isSelected = validSelectedIds.includes(order.id);

                  return (
                    <div
                      key={order.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button')) return;
                        toggleOrderSelection(order.id);
                      }}
                      onPointerEnter={() => {
                        if (!isDragSelecting) return;
                        setSelectedOrderIds((prev) => {
                          if (dragSelectTargetState) {
                            return prev.includes(order.id)
                              ? prev
                              : [...prev, order.id];
                          }
                          return prev.filter((id) => id !== order.id);
                        });
                      }}
                      className={`cursor-pointer flex flex-col justify-between rounded-[24px] border-2 bg-white transition-all ${
                        cardScale === 'compact'
                          ? 'p-3.5'
                          : cardScale === 'large'
                            ? 'p-6'
                            : 'p-5'
                      } ${
                        isSelected
                          ? 'border-[#3182F6] bg-[#F4F8FF] shadow-[0_8px_28px_rgba(49,130,246,0.16)] ring-2 ring-[#3182F6]/25'
                          : order.status === 'ready'
                            ? 'border-[#00C471] shadow-[0_4px_20px_rgba(0,196,113,0.1)]'
                            : order.status === 'preparing'
                              ? 'border-[#F59E0B] shadow-[0_4px_20px_rgba(245,158,11,0.08)]'
                              : order.status === 'pending'
                                ? 'border-transparent shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:border-[#D1D6DB]'
                                : order.status === 'completed'
                                  ? 'border-transparent opacity-90 shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                                  : 'border-transparent opacity-75 shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                      }`}
                    >
                      <div>
                        <div
                          className={`flex items-start justify-between gap-2 border-b border-[#F2F4F6] ${
                            cardScale === 'compact'
                              ? 'pb-2.5'
                              : cardScale === 'large'
                                ? 'pb-4'
                                : 'pb-3.5'
                          }`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* 체크박스 (보이는 상태 유지 + 카드 빈 공간 클릭/드래그 모두 작동) */}
                              <button
                                type="button"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const nextState = !isSelected;
                                  setIsDragSelecting(true);
                                  setDragSelectTargetState(nextState);
                                  toggleOrderSelection(order.id);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="체크박스를 누르거나 카드 빈 영역을 터치해 선택"
                                className={`flex items-center justify-center rounded-lg border-2 transition ${
                                  cardScale === 'large'
                                    ? 'h-7 w-7'
                                    : 'h-6 w-6'
                                } ${
                                  isSelected
                                    ? 'border-[#3182F6] bg-[#3182F6] text-white shadow-2xs'
                                    : 'border-[#D1D6DB] bg-white text-transparent hover:border-[#3182F6]'
                                }`}
                              >
                                <Check className="h-4 w-4 stroke-[3]" />
                              </button>

                              <span
                                className={`rounded-xl bg-[#191F28] font-black text-white ${
                                  cardScale === 'compact'
                                    ? 'px-2.5 py-0.5 text-xs'
                                    : cardScale === 'large'
                                      ? 'px-3.5 py-1 text-base'
                                      : 'px-3 py-1 text-xs'
                                }`}
                              >
                                #{order.order_number}
                              </span>
                              <span
                                className={`rounded-lg font-extrabold ${
                                  cardScale === 'large'
                                    ? 'px-2.5 py-1 text-xs'
                                    : 'px-2 py-0.5 text-[11px]'
                                } ${
                                  order.status === 'pending'
                                    ? 'bg-[#F2F4F6] text-[#4E5968]'
                                    : order.status === 'preparing'
                                      ? 'bg-[#FFF8E6] text-[#D97706]'
                                      : order.status === 'ready'
                                        ? 'bg-[#E8FAF0] text-[#00A859]'
                                        : 'bg-[#F2F4F6] text-[#8B95A1]'
                                }`}
                              >
                                {order.status === 'pending' && '신규 접수'}
                                {order.status === 'preparing' && '제조 중'}
                                {order.status === 'ready' && '픽업 호출됨'}
                                {order.status === 'completed' && '전달 완료'}
                                {order.status === 'cancelled' && '취소됨'}
                              </span>
                              <span className="text-[11px] font-semibold text-[#8B95A1]">
                                {order.order_source === 'qr' ? 'QR' : '카운터'} ·{' '}
                                {orderTime}
                              </span>
                            </div>

                            {/* 주문자 이름 + 전체 휴대폰 번호 */}
                            <h3
                              className={`font-black text-[#191F28] ${
                                cardScale === 'compact'
                                  ? 'mt-1.5 text-sm'
                                  : cardScale === 'large'
                                    ? 'mt-2.5 text-2xl'
                                    : 'mt-2 text-lg'
                              }`}
                            >
                              {order.customer_name}
                            </h3>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span
                                className={`font-mono font-bold text-[#4E5968] ${
                                  cardScale === 'compact'
                                    ? 'text-xs'
                                    : cardScale === 'large'
                                      ? 'text-base'
                                      : 'text-sm'
                                }`}
                              >
                                {order.phone}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span
                              className={`inline-block rounded-lg font-extrabold ${
                                cardScale === 'compact'
                                  ? 'px-2 py-0.5 text-[10px]'
                                  : cardScale === 'large'
                                    ? 'px-3 py-1 text-sm'
                                    : 'px-2.5 py-1 text-xs'
                              } ${
                                order.payment_method === 'transfer'
                                  ? 'bg-[#E8F3FF] text-[#3182F6]'
                                  : 'bg-[#E8FAF0] text-[#00A859]'
                              }`}
                            >
                              {order.payment_method === 'transfer'
                                ? '계좌이체'
                                : '현금결제'}
                            </span>
                            <p
                              className={`font-black text-[#191F28] ${
                                cardScale === 'compact'
                                  ? 'mt-1 text-base'
                                  : cardScale === 'large'
                                    ? 'mt-2 text-2xl'
                                    : 'mt-1.5 text-xl'
                              }`}
                            >
                              {formatCurrency(order.total_amount)}
                            </p>
                          </div>
                        </div>

                        {/* 제조할 메뉴 및 수량 */}
                        <div
                          className={
                            cardScale === 'compact'
                              ? 'my-2 space-y-1'
                              : cardScale === 'large'
                                ? 'my-4 space-y-2.5'
                                : 'my-3.5 space-y-2'
                          }
                        >
                          <div className="flex items-center justify-between text-xs font-bold text-[#8B95A1]">
                            <span>주문 메뉴</span>
                            <span>총 {totalCups}잔/개</span>
                          </div>
                          <ul
                            className={
                              cardScale === 'compact'
                                ? 'space-y-1'
                                : cardScale === 'large'
                                  ? 'space-y-2'
                                  : 'space-y-1.5'
                            }
                          >
                            {order.items.map((item) => (
                              <li
                                key={item.id}
                                className={`flex items-center justify-between rounded-2xl bg-[#F2F4F6]/80 ${
                                  cardScale === 'compact'
                                    ? 'px-2.5 py-1.5'
                                    : cardScale === 'large'
                                      ? 'px-4 py-3.5'
                                      : 'px-3.5 py-2.5'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {item.temp_option !== 'NONE' && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 rounded-lg font-black ${
                                        cardScale === 'compact'
                                          ? 'px-1.5 py-0.5 text-[10px]'
                                          : cardScale === 'large'
                                            ? 'px-2.5 py-1 text-sm'
                                            : 'px-2 py-0.5 text-xs'
                                      } ${
                                        item.temp_option === 'HOT'
                                          ? 'bg-[#FFEEEE] text-[#F04452]'
                                          : 'bg-[#E8F3FF] text-[#3182F6]'
                                      }`}
                                    >
                                      {item.temp_option}
                                    </span>
                                  )}
                                  <span
                                    className={`font-extrabold text-[#191F28] ${
                                      cardScale === 'compact'
                                        ? 'text-xs'
                                        : cardScale === 'large'
                                          ? 'text-xl'
                                          : 'text-base'
                                    }`}
                                  >
                                    {item.menu_name}
                                  </span>
                                </div>
                                <span
                                  className={`rounded-xl bg-white font-black text-[#191F28] shadow-2xs ${
                                    cardScale === 'compact'
                                      ? 'px-2 py-0.5 text-xs'
                                      : cardScale === 'large'
                                        ? 'px-3.5 py-1.5 text-xl'
                                        : 'px-2.5 py-1 text-base'
                                  }`}
                                >
                                  {item.quantity}개
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* 카드 하단 액션 버튼 영역 */}
                      {isActive ? (
                        <div
                          className={`border-t border-[#F2F4F6] ${
                            cardScale === 'compact'
                              ? 'mt-1.5 space-y-1.5 pt-2'
                              : cardScale === 'large'
                                ? 'mt-3 space-y-2.5 pt-4'
                                : 'mt-2 space-y-2 pt-3'
                          }`}
                        >
                          {/* 손님 스마트폰 실시간 상태 신호 발송 버튼 (수신확인/제조중 & 제조완료/픽업호출) */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateOrderStatus(order.id, 'preparing')
                              }
                              className={`flex items-center justify-center gap-1 rounded-xl font-extrabold transition ${
                                cardScale === 'compact'
                                  ? 'py-1.5 text-[11px]'
                                  : cardScale === 'large'
                                    ? 'py-3.5 text-sm'
                                    : 'py-2.5 text-xs'
                              } ${
                                order.status === 'preparing'
                                  ? 'bg-[#F59E0B] text-white shadow-2xs'
                                  : 'bg-[#FFF8E6] text-[#D97706] hover:bg-[#FEF0C7]'
                              }`}
                            >
                              <Play className="h-3.5 w-3.5 shrink-0" />
                              {order.status === 'preparing'
                                ? '제조중(발송됨)'
                                : '1. 수신·제조중'}
                            </button>

                            <button
                              type="button"
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              className={`flex items-center justify-center gap-1 rounded-xl font-extrabold transition ${
                                cardScale === 'compact'
                                  ? 'py-1.5 text-[11px]'
                                  : cardScale === 'large'
                                    ? 'py-3.5 text-sm'
                                    : 'py-2.5 text-xs'
                              } ${
                                order.status === 'ready'
                                  ? 'bg-[#00C471] text-white shadow-2xs'
                                  : 'bg-[#E8FAF0] text-[#00A859] hover:bg-[#D1F5E1]'
                              }`}
                            >
                              <BellRing className="h-3.5 w-3.5 shrink-0" />
                              {order.status === 'ready'
                                ? '호출됨(재호출)'
                                : '2. 완료·호출'}
                            </button>
                          </div>

                          {/* 최종 전달 및 결제 완료 버튼 (Toss Primary Blue) */}
                          <button
                            type="button"
                            onClick={() =>
                              updateOrderStatus(order.id, 'completed')
                            }
                            className={`flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#3182F6] font-extrabold text-white shadow-sm transition hover:bg-[#1B64DA] active:scale-[0.99] ${
                              cardScale === 'compact'
                                ? 'py-2 text-xs'
                                : cardScale === 'large'
                                  ? 'py-4 text-lg'
                                  : 'py-3.5 text-base'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            전달 및 결제완료
                          </button>

                          {/* 예외 처리: [수정] / [취소] 버튼 */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingOrder(order)}
                              className={`flex items-center justify-center gap-1 rounded-xl bg-[#F2F4F6] font-extrabold text-[#4E5968] hover:bg-[#E5E8EB] ${
                                cardScale === 'compact'
                                  ? 'py-1.5 text-[11px]'
                                  : cardScale === 'large'
                                    ? 'py-2.5 text-sm'
                                    : 'py-2 text-xs'
                              }`}
                            >
                              <Edit3 className="h-3 w-3 text-[#3182F6]" />
                              주문 수정
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancellingOrder(order)}
                              className={`flex items-center justify-center gap-1 rounded-xl bg-[#FFEEEE] font-extrabold text-[#F04452] hover:bg-[#FFD6D6] ${
                                cardScale === 'compact'
                                  ? 'py-1.5 text-[11px]'
                                  : cardScale === 'large'
                                    ? 'py-2.5 text-sm'
                                    : 'py-2 text-xs'
                              }`}
                            >
                              <XCircle className="h-3 w-3" />
                              주문 취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center justify-between border-t border-[#F2F4F6] pt-3">
                          <span
                            className={`text-xs font-extrabold ${
                              order.status === 'completed'
                                ? 'text-[#00A859]'
                                : 'text-[#F04452]'
                            }`}
                          >
                            {order.status === 'completed'
                              ? '전달 및 결제 완료됨'
                              : '취소 처리됨 (매출 제외)'}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateOrderStatus(order.id, 'pending')}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#F2F4F6] px-3 py-1.5 text-xs font-extrabold text-[#4E5968] hover:bg-[#E5E8EB]"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            대기열로 복구
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 모달 */}
      {editingOrder && (
        <OrderEditModal
          order={editingOrder}
          menus={menus}
          onClose={() => setEditingOrder(null)}
          onSave={async (orderId, updates) => {
            await updateOrderDetails(orderId, updates);
            await loadAllData();
          }}
        />
      )}

      {cancellingOrder && (
        <CancelConfirmModal
          order={cancellingOrder}
          onClose={() => setCancellingOrder(null)}
          onConfirmCancel={async (orderId) => {
            await updateOrderStatus(orderId, 'cancelled');
            await loadAllData();
          }}
        />
      )}

      {manageModalTab && (
        <MenuManageModal
          initialTab={manageModalTab}
          menus={menus}
          cafeSettings={cafeSettings}
          onClose={() => setManageModalTab(null)}
          onToggleSoldOut={async (menuId, isSoldOut) => {
            await toggleMenuSoldOut(menuId, isSoldOut);
            await loadAllData();
          }}
          onCreateMenu={async (input) => {
            await createMenu(input);
            await loadAllData();
          }}
          onUpdateMenu={async (menuId, updates) => {
            await updateMenu(menuId, updates);
            await loadAllData();
          }}
          onDeleteMenu={async (menuId) => {
            await deleteMenu(menuId);
            await loadAllData();
          }}
          onUpdateSettings={async (newSettings) => {
            await updateCafeSettings(newSettings);
            await loadAllData();
          }}
        />
      )}
    </div>
  );
}
