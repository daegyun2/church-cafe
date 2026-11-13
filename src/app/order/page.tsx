'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  DEFAULT_CAFE_SETTINGS,
  formatCurrency,
  formatPhoneNumber,
  isValidPhoneNumber,
} from '@/lib/config';
import {
  playStatusAlertSound,
  triggerCustomerPhoneAlert,
  unlockAudioOnUserGesture,
} from '@/lib/notifications';
import {
  createOrder,
  fetchCafeSettings,
  fetchMenus,
  fetchOrderById,
  fetchTodayOrders,
  subscribeCafeRealtime,
} from '@/lib/store';
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
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Coffee,
  Copy,
  Flame,
  Minus,
  Plus,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';

const ACTIVE_ORDER_STORAGE_KEY = 'church_cafe_active_guest_order_id';
const ACTIVE_ORDER_IDS_STORAGE_KEY = 'church_cafe_active_guest_order_ids';

function loadSavedOrderIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const rawList = localStorage.getItem(ACTIVE_ORDER_IDS_STORAGE_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
    }
    const single = localStorage.getItem(ACTIVE_ORDER_STORAGE_KEY);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

function saveOrderIdsToStorage(ids: string[]): void {
  if (typeof window === 'undefined') return;
  const unique = Array.from(new Set(ids));
  localStorage.setItem(ACTIVE_ORDER_IDS_STORAGE_KEY, JSON.stringify(unique));
  if (unique.length > 0) {
    localStorage.setItem(ACTIVE_ORDER_STORAGE_KEY, unique[unique.length - 1]);
  } else {
    localStorage.removeItem(ACTIVE_ORDER_STORAGE_KEY);
  }
}

export default function GuestOrderPage() {
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(
    DEFAULT_CAFE_SETTINGS
  );
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [optionModalMenu, setOptionModalMenu] = useState<MenuItem | null>(null);
  const [selectedTemp, setSelectedTemp] = useState<TempOption>('ICE');
  const [selectedQty, setSelectedQty] = useState<number>(1);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('010-');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [submitting, setSubmitting] = useState(false);

  // 한 스마트폰에서 여러 건 주문 시 모든 내 주문을 동시에 추적
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isViewingMenu, setIsViewingMenu] = useState<boolean>(false);

  const [activeQueueOrders, setActiveQueueOrders] = useState<Order[]>([]);
  const [copied, setCopied] = useState(false);
  const [liveAlertBanner, setLiveAlertBanner] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');

  const prevStatusMapRef = useRef<Record<string, OrderStatus>>({});

  const completedOrder =
    !isViewingMenu && myOrders.length > 0
      ? myOrders.find((o) => o.id === selectedOrderId) ||
        myOrders[myOrders.length - 1]
      : null;

  const loadMenus = useCallback(async () => {
    const [settingsData, data, todayOrders] = await Promise.all([
      fetchCafeSettings(),
      fetchMenus(),
      fetchTodayOrders(),
    ]);
    setCafeSettings(settingsData);
    if (settingsData.allow_transfer === false && settingsData.allow_cash !== false) {
      setPaymentMethod('cash');
    } else if (settingsData.allow_cash === false && settingsData.allow_transfer !== false) {
      setPaymentMethod('transfer');
    }
    setMenus(data.filter((m) => m.is_visible));
    const waitingList = todayOrders
      .filter((o) => o.status === 'pending' || o.status === 'preparing')
      .sort((a, b) => a.order_number - b.order_number);
    setActiveQueueOrders(waitingList);
  }, []);

  // 내 모든 주문들을 실시간 조회 및 상태 변경 감지 (어느 주문이든 상태 변경 시 즉시 알림)
  const refreshMyTrackedOrders = useCallback(async () => {
    const savedIds = loadSavedOrderIds();
    if (savedIds.length === 0) {
      setMyOrders([]);
      return;
    }

    const fetchedList = await Promise.all(
      savedIds.map((id) => fetchOrderById(id))
    );
    const validOrders = fetchedList.filter((o): o is Order => o !== null);

    for (const latest of validOrders) {
      const prevStatus = prevStatusMapRef.current[latest.id];
      if (prevStatus && prevStatus !== latest.status) {
        triggerCustomerPhoneAlert(
          latest.order_number,
          latest.customer_name,
          latest.status
        );

        if (latest.status === 'preparing') {
          setLiveAlertBanner(
            `🔔 [주문 #${latest.order_number}] 카운터에서 주문을 확인하고 음료 제조를 시작했습니다!`
          );
        } else if (latest.status === 'ready') {
          setLiveAlertBanner(
            `🎉 [주문 #${latest.order_number}] 음료 제조가 완료되었습니다! 카운터에서 픽업해 주세요!`
          );
          setSelectedOrderId(latest.id);
        } else if (latest.status === 'completed') {
          setLiveAlertBanner(
            `✅ [주문 #${latest.order_number}] 음료 전달 및 결제가 완료되었습니다. 감사합니다!`
          );
        } else if (latest.status === 'cancelled') {
          setLiveAlertBanner(
            `⚠️ [주문 #${latest.order_number}] 주문이 카운터에서 취소되었습니다.`
          );
        }
      }
      prevStatusMapRef.current[latest.id] = latest.status;
    }

    setMyOrders(validOrders);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }

    // 새로고침 시에도 내가 주문한 모든 내역 복원
    const savedIds = loadSavedOrderIds();
    if (savedIds.length > 0) {
      Promise.all(savedIds.map((id) => fetchOrderById(id))).then((list) => {
        const valid = list.filter((o): o is Order => o !== null);
        valid.forEach((o) => {
          prevStatusMapRef.current[o.id] = o.status;
        });
        setMyOrders(valid);
        if (valid.length > 0) {
          setSelectedOrderId(valid[valid.length - 1].id);
        }
      });
    }
  }, []);

  useEffect(() => {
    loadMenus();
    const unsubscribe = subscribeCafeRealtime(() => {
      loadMenus();
      refreshMyTrackedOrders();
    });
    return () => unsubscribe();
  }, [loadMenus, refreshMyTrackedOrders]);

  // 장바구니 품절 메뉴 자동 정리
  useEffect(() => {
    if (menus.length === 0 || cart.length === 0) return;
    const soldOutIds = new Set(menus.filter((m) => m.is_sold_out).map((m) => m.id));
    if (cart.some((c) => soldOutIds.has(c.menu.id))) {
      setCart((prev) => prev.filter((c) => !soldOutIds.has(c.menu.id)));
    }
  }, [menus, cart]);

  const requestPushPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('현재 브라우저에서는 시스템 알림을 지원하지 않습니다. 화면 내 알림음과 배너로 안내해 드립니다.');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      playStatusAlertSound('preparing');
    }
  };

  const visibleCategories = cafeSettings.categories.filter(
    (c) => c.is_visible !== false
  );
  const visibleCatIds = new Set(visibleCategories.map((c) => c.id));
  const isQrOrderPaused = cafeSettings.is_qr_order_enabled === false;

  const visibleMenus = menus.filter(
    (m) =>
      visibleCatIds.has(m.category) &&
      (selectedCategory === 'all' || m.category === selectedCategory)
  );

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.menu.price * item.quantity,
    0
  );

  const handleMenuClick = (menu: MenuItem) => {
    if (menu.is_sold_out || isQrOrderPaused) return;
    setOptionModalMenu(menu);
    setSelectedTemp(menu.default_temp);
    setSelectedQty(1);
  };

  const handleAddToCart = () => {
    if (!optionModalMenu) return;
    const temp: TempOption = optionModalMenu.has_temp_option
      ? selectedTemp
      : optionModalMenu.default_temp;
    const cartKey = `${optionModalMenu.id}-${temp}`;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === cartKey);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: updated[idx].quantity + selectedQty,
        };
        return updated;
      }
      return [
        ...prev,
        {
          cartKey,
          menu: optionModalMenu,
          temp_option: temp,
          quantity: selectedQty,
        },
      ];
    });
    setOptionModalMenu(null);
  };

  const updateCartQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudioOnUserGesture();
    if (cart.length === 0) return;
    if (!customerName.trim()) {
      alert('주문자 성함을 입력해 주세요.');
      return;
    }
    if (!isValidPhoneNumber(phone)) {
      alert('휴대폰 번호 전체(예: 010-1234-5678)를 정확히 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createOrder({
        customer_name: customerName.trim(),
        phone: formatPhoneNumber(phone),
        payment_method: paymentMethod,
        order_source: 'qr',
        items: cart.map((c) => ({
          menu_id: c.menu.id,
          menu_name: c.menu.name,
          temp_option: c.temp_option,
          quantity: c.quantity,
          unit_price: c.menu.price,
        })),
      });
      prevStatusMapRef.current[created.id] = created.status;
      const updatedOrders = [
        ...myOrders.filter((o) => o.id !== created.id),
        created,
      ];
      setMyOrders(updatedOrders);
      setSelectedOrderId(created.id);
      setIsViewingMenu(false);
      setLiveAlertBanner(null);
      saveOrderIdsToStorage(updatedOrders.map((o) => o.id));
      setCart([]);
      setIsCheckoutOpen(false);
      await loadMenus();
    } catch (err) {
      console.error(err);
      alert('주문 접수 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyAccount = async () => {
    const textToCopy = `${cafeSettings.bank_name} ${cafeSettings.account_number}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // ==========================================================================
  // 주문 완료 및 실시간 상태 알림 화면 (접수 -> 제조중 -> 제조완료 알람)
  // ==========================================================================
  if (completedOrder) {
    const statusSteps: {
      key: OrderStatus;
      label: string;
    }[] = [
      { key: 'pending', label: '주문 접수' },
      { key: 'preparing', label: '제조 중' },
      { key: 'ready', label: '제조 완료' },
      { key: 'completed', label: '수령 완료' },
    ];

    const currentStepIdx = statusSteps.findIndex(
      (s) => s.key === completedOrder.status
    );

    const ordersAhead = activeQueueOrders.filter(
      (o) =>
        o.order_number < completedOrder.order_number &&
        o.id !== completedOrder.id &&
        (o.status === 'pending' || o.status === 'preparing')
    );
    const teamsAheadCount = ordersAhead.length;
    const cupsAheadCount = ordersAhead.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
      0
    );
    const myCupsCount = completedOrder.items.reduce(
      (s, i) => s + i.quantity,
      0
    );
    const isMyOrderWaiting =
      completedOrder.status === 'pending' ||
      completedOrder.status === 'preparing';
    const isOrderFinished =
      completedOrder.status === 'completed' ||
      completedOrder.status === 'cancelled';

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between bg-white p-5 shadow-lg">
        <div className="space-y-4 pt-1">
          {/* 내 주문 목록 전환 바 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2.5">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-extrabold text-slate-600">
                내 주문 ({myOrders.length}건)
              </span>
              <button
                type="button"
                onClick={() => setIsViewingMenu(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-black text-slate-950 shadow-2xs hover:bg-amber-400"
              >
                <Plus className="h-3 w-3" />
                추가 주문
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {myOrders.map((ord) => {
                const isSelected = ord.id === completedOrder.id;
                const statusBadge =
                  ord.status === 'ready'
                    ? '픽업 🎉'
                    : ord.status === 'preparing'
                      ? '제조중 🔥'
                      : ord.status === 'pending'
                        ? '접수 ☕'
                        : ord.status === 'completed'
                          ? '완료 ✓'
                          : '취소';
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => setSelectedOrderId(ord.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                      isSelected
                        ? ord.status === 'ready'
                          ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                          : 'bg-slate-900 text-white shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>#{ord.order_number}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : ord.status === 'ready'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ord.status === 'preparing'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {statusBadge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 실시간 상태 변경 알림 팝업 배너 */}
          {liveAlertBanner && (
            <div
              className={`flex items-center justify-between gap-2 rounded-2xl p-3.5 text-sm font-black shadow-lg transition-all ${
                completedOrder.status === 'ready'
                  ? 'animate-bounce bg-emerald-600 text-white'
                  : completedOrder.status === 'preparing'
                    ? 'bg-amber-500 text-slate-950'
                    : completedOrder.status === 'cancelled'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-900 text-white'
              }`}
            >
              <span>{liveAlertBanner}</span>
              <button
                type="button"
                onClick={() => setLiveAlertBanner(null)}
                className="rounded-lg p-1 opacity-80 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 상단 주문번호 & 현재 상태 헤더 */}
          <div className="text-center">
            <span className="inline-block rounded-full bg-amber-100 px-3.5 py-1 text-xs font-black text-amber-900">
              주문번호 #{completedOrder.order_number}
            </span>

            <h1 className="mt-1.5 text-2xl font-black text-slate-900">
              {completedOrder.status === 'pending' && '주문이 접수되었습니다'}
              {completedOrder.status === 'preparing' && '음료를 제조하고 있습니다 ☕'}
              {completedOrder.status === 'ready' && '음료가 완성되었습니다! 🎉'}
              {completedOrder.status === 'completed' && '전달 완료되었습니다'}
              {completedOrder.status === 'cancelled' && '주문이 취소되었습니다'}
            </h1>
          </div>

          {/* 심플 4단계 진행 바 */}
          {completedOrder.status !== 'cancelled' && (
            <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-2">
              {statusSteps.map((step, idx) => {
                const isActive = idx === currentStepIdx;
                const isDone = idx < currentStepIdx;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center justify-center rounded-xl py-2.5 text-center text-xs font-black transition ${
                      isActive
                        ? step.key === 'ready'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-900 text-white shadow-xs'
                        : isDone
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-white text-slate-400'
                    }`}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>
          )}

          {/* 내 앞 실시간 대기열 시각화 일러스트 (접수 / 제조중일 때 표시) */}
          {isMyOrderWaiting && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-black text-slate-800">
                  ☕ 앞 대기{' '}
                  <strong className="text-amber-600">{teamsAheadCount}팀</strong>{' '}
                  <span className="text-slate-500">({cupsAheadCount}잔)</span>
                </span>
                <span className="rounded-lg bg-slate-900 px-2.5 py-0.5 text-[11px] font-black text-amber-400">
                  {teamsAheadCount === 0
                    ? '현재 내 차례'
                    : `${teamsAheadCount + 1}번째 순서`}
                </span>
              </div>

              {/* 시각적 줄서기(컨베이어) 그림 */}
              <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-amber-200/70 bg-white p-2.5">
                {/* 1. 왼쪽 끝: 카운터 */}
                <div className="flex shrink-0 flex-col items-center rounded-xl bg-slate-900 px-2.5 py-2 text-white">
                  <Coffee className="h-4 w-4 text-amber-400" />
                  <span className="mt-1 text-[10px] font-black text-amber-300">
                    카운터
                  </span>
                </div>

                <span className="shrink-0 text-xs font-black text-amber-500">
                  ◀
                </span>

                {/* 2. 중간: 내 앞 대기 팀들 */}
                {ordersAhead.length <= 3 ? (
                  ordersAhead.map((aheadOrder) => {
                    const cupCnt = aheadOrder.items.reduce(
                      (s, i) => s + i.quantity,
                      0
                    );
                    const isPrep = aheadOrder.status === 'preparing';
                    return (
                      <React.Fragment key={aheadOrder.id}>
                        <div
                          className={`flex shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 ${
                            isPrep
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <span className="font-mono text-[11px] font-black text-slate-800">
                            {isPrep ? '🔥' : '☕'} #{aheadOrder.order_number}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {cupCnt}잔
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] font-black text-slate-300">
                          ◀
                        </span>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <>
                    {(() => {
                      const first = ordersAhead[0];
                      const firstCups = first.items.reduce(
                        (s, i) => s + i.quantity,
                        0
                      );
                      const isPrep = first.status === 'preparing';
                      return (
                        <div
                          className={`flex shrink-0 flex-col items-center rounded-xl border px-2.5 py-1.5 ${
                            isPrep
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <span className="font-mono text-[11px] font-black text-slate-800">
                            #{first.order_number}
                          </span>
                          <span className="text-[10px] font-bold text-amber-800">
                            {firstCups}잔
                          </span>
                        </div>
                      );
                    })()}
                    <div className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                      +{ordersAhead.length - 2}팀
                    </div>
                    {(() => {
                      const prev = ordersAhead[ordersAhead.length - 1];
                      const prevCups = prev.items.reduce(
                        (s, i) => s + i.quantity,
                        0
                      );
                      return (
                        <div className="flex shrink-0 flex-col items-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                          <span className="font-mono text-[11px] font-black text-slate-800">
                            #{prev.order_number}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {prevCups}잔
                          </span>
                        </div>
                      );
                    })()}
                    <span className="shrink-0 text-[10px] font-black text-slate-300">
                      ◀
                    </span>
                  </>
                )}

                {/* 3. 오른쪽 끝: 나 */}
                <div className="flex shrink-0 flex-col items-center rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-1.5 ring-2 ring-emerald-100">
                  <span className="font-mono text-xs font-black text-emerald-950">
                    나 #{completedOrder.order_number}
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-700">
                    {myCupsCount}잔
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 총 결제 금액 대형 표시 박스 */}
          <div className="rounded-3xl bg-slate-900 p-5 text-center text-white shadow-xl">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              총 결제 예정 금액
            </p>
            <p className="mt-1.5 text-4xl font-black tracking-tight text-amber-400">
              {formatCurrency(completedOrder.total_amount)}
            </p>
            <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-slate-800 px-3.5 py-1 text-xs font-bold text-slate-200">
              <span>
                {completedOrder.customer_name} ({completedOrder.phone})
              </span>
              <span>•</span>
              <span
                className={
                  completedOrder.payment_method === 'transfer'
                    ? 'text-sky-400'
                    : 'text-emerald-400'
                }
              >
                {completedOrder.payment_method === 'transfer'
                  ? '계좌이체'
                  : '현금결제'}
              </span>
            </div>
          </div>

          {/* 계좌이체 안내 및 원클릭 복사 카드 */}
          <div className="rounded-3xl border-2 border-blue-200 bg-blue-50/70 p-5">
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-extrabold text-white">
                입금 계좌 안내
              </span>
              <span className="text-xs font-bold text-blue-900">
                예금주: {cafeSettings.account_holder}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-sm font-bold text-slate-700">
                {cafeSettings.bank_name}
              </p>
              <p className="mt-0.5 font-mono text-2xl font-black tracking-wider text-slate-900">
                {cafeSettings.account_number}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyAccount}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold shadow-md transition active:scale-[0.99] ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-5 w-5" />
                  계좌번호가 복사되었습니다!
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  계좌번호 원클릭 복사하기
                </>
              )}
            </button>
          </div>

          {/* 주문 상세 내역 요약 */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-2.5 text-xs font-extrabold text-slate-500">
              주문 메뉴 내역
            </h3>
            <ul className="divide-y divide-slate-200/70 text-sm">
              {completedOrder.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-2 font-medium text-slate-800"
                >
                  <span>
                    {item.menu_name}{' '}
                    {item.temp_option !== 'NONE' && (
                      <span
                        className={`ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                          item.temp_option === 'HOT'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {item.temp_option}
                      </span>
                    )}
                  </span>
                  <span className="font-bold">
                    {item.quantity}개 · {formatCurrency(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2 pt-4">
          {/* 기존 주문을 유지한 채 메뉴판으로 가서 추가 주문하기 */}
          <button
            type="button"
            onClick={() => {
              setIsViewingMenu(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white shadow-md transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            추가 주문하기 (메뉴판 보기)
          </button>

          {/* 음료 수령 완료(completed) 또는 취소(cancelled)된 주문만 목록에서 비울 수 있게 보호 */}
          {isOrderFinished && (
            <button
              type="button"
              onClick={() => {
                const remaining = myOrders.filter(
                  (o) => o.id !== completedOrder.id
                );
                setMyOrders(remaining);
                saveOrderIdsToStorage(remaining.map((o) => o.id));
                if (remaining.length > 0) {
                  setSelectedOrderId(remaining[remaining.length - 1].id);
                } else {
                  setSelectedOrderId(null);
                  setLiveAlertBanner(null);
                }
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 text-xs font-bold text-slate-500 hover:bg-slate-100"
            >
              완료된 주문(#{completedOrder.order_number}) 내역 닫기
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 기본 메뉴 선택 화면 (모바일 세로형)
  // ==========================================================================
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 pb-28 shadow-lg">
      {/* 진행 중인 내 주문이 있을 때 언제든 다시 대기 화면으로 돌아갈 수 있는 상단 고정 바 */}
      {myOrders.length > 0 && (
        <div className="sticky top-0 z-30 bg-slate-900 px-4 py-2.5 text-white shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="flex h-2.5 w-2.5 shrink-0 animate-ping rounded-full bg-emerald-400" />
              <span className="truncate text-xs font-extrabold">
                내 주문 {myOrders.length}건 (
                {myOrders.map((o) => `#${o.order_number}`).join(', ')})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsViewingMenu(false)}
              className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-2xs hover:bg-amber-400"
            >
              주문 현황 보기 →
            </button>
          </div>
        </div>
      )}

      {/* 상단 헤더 */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white">
              <Coffee className="h-5 w-5" />
            </div>
            <h1 className="text-base font-black text-slate-900">
              {cafeSettings.cafe_name}
            </h1>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체 메뉴
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* QR 주문 일시 중지(예배시간/준비중) 안내 배너 */}
      {isQrOrderPaused && (
        <div className="mx-4 mt-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-center shadow-xs">
          <p className="text-sm font-black text-amber-950">
            ⏸️ 잠시 모바일 주문 접수가 중단되었습니다
          </p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800">
            {cafeSettings.qr_pause_message ||
              '현재 예배 시간(또는 재료 준비 중)으로 잠시 모바일 주문을 멈추었습니다.'}
          </p>
        </div>
      )}

      {/* 주문 전 메뉴판 상단: 현재 카페 실시간 대기 현황 그래픽 */}
      {!isQrOrderPaused &&
        (() => {
          const totalWaitingTeams = activeQueueOrders.length;
          const totalWaitingCups = activeQueueOrders.reduce(
            (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
            0
          );
          const congestion =
            totalWaitingTeams === 0
              ? {
                  label: '바로 제조',
                  badgeClass: 'bg-emerald-600 text-white',
                  boxClass: 'border-emerald-200 bg-emerald-50/60',
                }
              : totalWaitingTeams <= 2
                ? {
                    label: '여유',
                    badgeClass: 'bg-emerald-600 text-white',
                    boxClass: 'border-emerald-200 bg-emerald-50/50',
                  }
                : totalWaitingTeams <= 5
                  ? {
                      label: '보통',
                      badgeClass: 'bg-amber-500 text-slate-950',
                      boxClass: 'border-amber-200 bg-amber-50/60',
                    }
                  : {
                      label: '혼잡',
                      badgeClass: 'bg-rose-600 text-white',
                      boxClass: 'border-rose-200 bg-rose-50/60',
                    };

          return (
            <div
              className={`mx-4 mt-3.5 rounded-2xl border p-3 shadow-2xs ${congestion.boxClass}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${congestion.badgeClass}`}
                  >
                    {congestion.label}
                  </span>
                  <span className="text-xs font-black text-slate-900">
                    대기 {totalWaitingTeams}팀 ({totalWaitingCups}잔)
                  </span>
                </div>
              </div>

              {/* 시각적 대기열 미니 일러스트 */}
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto rounded-xl bg-white/90 px-2.5 py-2">
                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-amber-400">
                  <Coffee className="h-3 w-3" />
                  카운터
                </div>
                <span className="shrink-0 text-[10px] font-black text-amber-500">
                  ◀
                </span>

                {activeQueueOrders.slice(0, 3).map((o) => {
                  const cupCnt = o.items.reduce((s, i) => s + i.quantity, 0);
                  const isPrep = o.status === 'preparing';
                  return (
                    <React.Fragment key={o.id}>
                      <div
                        className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-extrabold ${
                          isPrep
                            ? 'border-amber-400 bg-amber-50 text-amber-950'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>{isPrep ? '🔥' : '☕'}</span>
                        <span>#{o.order_number}</span>
                        <span className="text-slate-400">({cupCnt}잔)</span>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-slate-300">
                        ◀
                      </span>
                    </React.Fragment>
                  );
                })}

                {activeQueueOrders.length > 3 && (
                  <>
                    <span className="shrink-0 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-600">
                      +{activeQueueOrders.length - 3}팀
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-slate-300">
                      ◀
                    </span>
                  </>
                )}

                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-emerald-500 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">
                  내 자리 ({totalWaitingTeams + 1}번째)
                </div>
              </div>
            </div>
          );
        })()}

      {/* 메뉴 리스트 */}
      <main className="flex-1 space-y-2.5 p-4">
        {visibleMenus.map((menu) => {
          const isSoldOut = menu.is_sold_out;
          return (
            <button
              key={menu.id}
              type="button"
              disabled={isSoldOut}
              onClick={() => handleMenuClick(menu)}
              className={`relative flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${
                isSoldOut
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-65'
                  : 'border-slate-200/90 bg-white shadow-2xs active:scale-[0.99] hover:border-amber-500'
              }`}
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`text-base font-extrabold ${
                      isSoldOut ? 'text-slate-400 line-through' : 'text-slate-900'
                    }`}
                  >
                    {menu.name}
                  </span>
                  {menu.is_new && !isSoldOut && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      <Sparkles className="h-2.5 w-2.5" /> NEW
                    </span>
                  )}
                  {isSoldOut && (
                    <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-black text-white">
                      품절 (SOLD OUT)
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  {menu.has_temp_option ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                      <span className="text-rose-600">HOT</span> /{' '}
                      <span className="text-sky-600">ICE</span> 선택 가능
                    </span>
                  ) : menu.default_temp !== 'NONE' ? (
                    <span
                      className={`font-bold ${
                        menu.default_temp === 'HOT'
                          ? 'text-rose-600'
                          : 'text-sky-600'
                      }`}
                    >
                      {menu.default_temp} 전용
                    </span>
                  ) : (
                    <span className="text-slate-400">디저트/단품</span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`text-base font-black ${
                    isSoldOut ? 'text-slate-400' : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(menu.price)}
                </span>
                {!isSoldOut && (
                  <div className="mt-1 text-[11px] font-bold text-amber-600">
                    + 담기
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </main>

      {/* 메뉴 옵션 선택 모달 (Hot/Ice & 수량) */}
      {optionModalMenu && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {optionModalMenu.name}
                </h3>
                <p className="mt-0.5 text-sm font-bold text-amber-600">
                  {formatCurrency(optionModalMenu.price)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOptionModalMenu(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Hot / Ice 선택 */}
            {optionModalMenu.has_temp_option ? (
              <div className="mt-5">
                <label className="block text-xs font-extrabold text-slate-600">
                  온도 선택 (필수)
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedTemp('ICE')}
                    className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-base font-black transition ${
                      selectedTemp === 'ICE'
                        ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <Snowflake className="h-5 w-5" />
                    시원한 ICE
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTemp('HOT')}
                    className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-base font-black transition ${
                      selectedTemp === 'HOT'
                        ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <Flame className="h-5 w-5" />
                    따뜻한 HOT
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs font-bold text-slate-600">
                {optionModalMenu.default_temp === 'NONE'
                  ? '온도 옵션이 없는 메뉴입니다.'
                  : `이 메뉴는 ${optionModalMenu.default_temp} 전용 메뉴입니다.`}
              </div>
            )}

            {/* 수량 선택 */}
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 p-4">
              <span className="text-sm font-extrabold text-slate-700">수량 선택</span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedQty((q) => Math.max(1, q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 active:scale-95"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-lg font-black text-slate-900">
                  {selectedQty}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedQty((q) => q + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              className="mt-6 w-full rounded-2xl bg-slate-900 py-4 text-base font-extrabold text-white shadow-lg active:scale-[0.99]"
            >
              {formatCurrency(optionModalMenu.price * selectedQty)} 장바구니 담기
            </button>
          </div>
        </div>
      )}

      {/* 하단 고정 장바구니 바 */}
      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-md border-t border-slate-200 bg-white p-4 shadow-2xl">
          <button
            type="button"
            onClick={() => setIsCheckoutOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-amber-600 px-5 py-4 text-white shadow-lg transition hover:bg-amber-700 active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-amber-700">
                {totalCount}
              </div>
              <span className="text-base font-extrabold">주문하기 (장바구니 확인)</span>
            </div>
            <span className="text-lg font-black">{formatCurrency(totalAmount)}</span>
          </button>
        </div>
      )}

      {/* 주문자 정보 입력 및 최종 주문 바텀시트 */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <ShoppingBag className="h-5 w-5 text-amber-600" />
                주문 확인 및 연락처 입력
              </h2>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handlePlaceOrder}
              className="flex-1 space-y-5 overflow-y-auto p-6"
            >
              {/* 담긴 메뉴 리스트 */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-500">
                  선택한 메뉴 ({totalCount}개)
                </label>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                  {cart.map((item) => (
                    <div
                      key={item.cartKey}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <span className="text-sm font-extrabold text-slate-900">
                          {item.menu.name}
                        </span>
                        {item.temp_option !== 'NONE' && (
                          <span
                            className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                              item.temp_option === 'HOT'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-sky-100 text-sky-700'
                            }`}
                          >
                            {item.temp_option}
                          </span>
                        )}
                        <p className="text-xs font-semibold text-slate-500">
                          {formatCurrency(item.menu.price * item.quantity)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.cartKey, -1)}
                          className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center text-sm font-black">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.cartKey, 1)}
                          className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.cartKey, -item.quantity)}
                          className="ml-1 text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 주문자 이름 & 휴대폰 번호 전체 입력 */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700">
                    주문자 이름 *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 홍길동"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-bold text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700">
                    휴대폰 번호 전체 * (제조 완료 알림 및 픽업 확인용)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    required
                    placeholder="010-1234-5678"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-black tracking-wider text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 결제 예정 수단 선택 (숨김 설정된 수단은 자동 제외) */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700">
                  결제 예정 수단 선택 *
                </label>
                <div className="mt-1.5 flex gap-3">
                  {cafeSettings.allow_transfer !== false && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transfer')}
                      className={`flex-1 rounded-2xl border-2 py-3.5 text-sm font-black transition ${
                        paymentMethod === 'transfer'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      계좌이체
                    </button>
                  )}
                  {cafeSettings.allow_cash !== false && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`flex-1 rounded-2xl border-2 py-3.5 text-sm font-black transition ${
                        paymentMethod === 'cash'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      현금결제 (카운터)
                    </button>
                  )}
                </div>
              </div>

              {/* 총 결제 금액 & 주문 완료 버튼 */}
              <div className="border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-600">총 결제 금액</span>
                  <span className="text-2xl font-black text-amber-600">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting || cart.length === 0}
                  className="w-full rounded-2xl bg-slate-900 py-4 text-base font-black text-white shadow-xl transition hover:bg-slate-800 disabled:bg-slate-400"
                >
                  {submitting ? '주문 전송 중...' : '주문 접수하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
