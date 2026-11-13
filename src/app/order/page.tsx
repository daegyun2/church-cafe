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
  ChevronDown,
  ChevronUp,
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
const GUEST_PROFILE_STORAGE_KEY = 'church_cafe_guest_profile';

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
  // 완료 후 5초가 지나 자동으로 대기 화면에서 닫힌 주문 ID 목록
  const [dismissedFinishedIds, setDismissedFinishedIds] = useState<string[]>(
    []
  );
  // 우측 상단 [내 주문내역] 영수증 리스트 & 상세 영수증 모달 상태
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] =
    useState<Order | null>(null);
  // 대기 화면 상단 [내 주문 (~건) ▾] 접이식 목록 열림 상태 (기본 숨김)
  const [isOrderListExpanded, setIsOrderListExpanded] =
    useState<boolean>(false);

  const [activeQueueOrders, setActiveQueueOrders] = useState<Order[]>([]);
  const [copied, setCopied] = useState(false);
  const [liveAlertBanner, setLiveAlertBanner] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');

  const prevStatusMapRef = useRef<Record<string, OrderStatus>>({});
  const finishedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleAutoDismiss = useCallback((orderId: string) => {
    if (finishedTimersRef.current[orderId]) {
      clearTimeout(finishedTimersRef.current[orderId]);
    }
    finishedTimersRef.current[orderId] = setTimeout(() => {
      delete finishedTimersRef.current[orderId];
      setDismissedFinishedIds((prev) =>
        prev.includes(orderId) ? prev : [...prev, orderId]
      );
    }, 5000);
  }, []);

  const clearAutoDismiss = useCallback((orderId: string) => {
    if (finishedTimersRef.current[orderId]) {
      clearTimeout(finishedTimersRef.current[orderId]);
      delete finishedTimersRef.current[orderId];
    }
    setDismissedFinishedIds((prev) => prev.filter((id) => id !== orderId));
  }, []);

  // 실시간 대기 화면에 띄울 대상: 진행 중(pending/preparing/ready)이거나, 방금 완료되어 아직 5초가 안 지난 주문만!
  const liveTrackableOrders = myOrders.filter(
    (o) =>
      o.status === 'pending' ||
      o.status === 'preparing' ||
      o.status === 'ready' ||
      !dismissedFinishedIds.includes(o.id)
  );

  const completedOrder =
    !isViewingMenu && liveTrackableOrders.length > 0
      ? liveTrackableOrders.find((o) => o.id === selectedOrderId) ||
        liveTrackableOrders[liveTrackableOrders.length - 1]
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

        if (latest.status === 'pending') {
          setLiveAlertBanner(
            `🔄 [주문 #${latest.order_number}] 카운터에서 주문이 대기열로 다시 복구되었습니다!`
          );
          clearAutoDismiss(latest.id);
          setSelectedOrderId(latest.id);
          setIsViewingMenu(false);
          setIsHistoryOpen(false);
        } else if (latest.status === 'preparing') {
          setLiveAlertBanner(
            `🔔 [주문 #${latest.order_number}] 카운터에서 주문을 확인하고 음료 제조를 시작했습니다!`
          );
          clearAutoDismiss(latest.id);
          setSelectedOrderId(latest.id);
          setIsViewingMenu(false);
        } else if (latest.status === 'ready') {
          setLiveAlertBanner(
            `🎉 [주문 #${latest.order_number}] 음료 제조가 완료되었습니다! 카운터에서 픽업해 주세요!`
          );
          clearAutoDismiss(latest.id);
          setSelectedOrderId(latest.id);
          setIsViewingMenu(false);
        } else if (latest.status === 'completed') {
          setLiveAlertBanner(
            `✅ [주문 #${latest.order_number}] 음료 전달 및 결제가 완료되었습니다. (5초 뒤 메뉴판으로 이동)`
          );
          scheduleAutoDismiss(latest.id);
        } else if (latest.status === 'cancelled') {
          setLiveAlertBanner(
            `⚠️ [주문 #${latest.order_number}] 주문이 카운터에서 취소되었습니다.`
          );
          scheduleAutoDismiss(latest.id);
        }
      }
      prevStatusMapRef.current[latest.id] = latest.status;
    }

    setMyOrders(validOrders);
  }, [clearAutoDismiss, scheduleAutoDismiss]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }

    // 내 스마트폰에 저장된 주문자 이름 & 휴대폰 번호 자동 불러오기
    if (typeof window !== 'undefined') {
      try {
        const savedProfile = localStorage.getItem(GUEST_PROFILE_STORAGE_KEY);
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile) as {
            name?: string;
            phone?: string;
          };
          if (parsed.name) setCustomerName(parsed.name);
          if (parsed.phone) setPhone(parsed.phone);
        }
      } catch {
        // Ignore
      }
    }

    // 새로고침 시 오늘 내가 주문한 내역 복원 (이미 완료된 주문은 대기 화면에 안 띄우고 [내 주문내역]에서만 조회 가능)
    const savedIds = loadSavedOrderIds();
    if (savedIds.length > 0) {
      Promise.all(savedIds.map((id) => fetchOrderById(id))).then((list) => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const validToday = list.filter(
          (o): o is Order =>
            o !== null && new Date(o.created_at) >= todayStart
        );
        validToday.forEach((o) => {
          prevStatusMapRef.current[o.id] = o.status;
        });
        saveOrderIdsToStorage(validToday.map((o) => o.id));
        setMyOrders(validToday);

        const alreadyFinishedIds = validToday
          .filter((o) => o.status === 'completed' || o.status === 'cancelled')
          .map((o) => o.id);
        setDismissedFinishedIds(alreadyFinishedIds);

        const activeOnes = validToday.filter(
          (o) => o.status !== 'completed' && o.status !== 'cancelled'
        );
        if (activeOnes.length > 0) {
          setSelectedOrderId(activeOnes[activeOnes.length - 1].id);
          setIsViewingMenu(false);
        } else {
          setIsViewingMenu(true);
        }
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      Object.values(finishedTimersRef.current).forEach(clearTimeout);
    };
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
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          GUEST_PROFILE_STORAGE_KEY,
          JSON.stringify({
            name: customerName.trim(),
            phone: formatPhoneNumber(phone),
          })
        );
      }
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

    // 대기열 진행률 (앞 대기 팀이 줄어들수록 게이지가 채워짐)
    const queueProgressPercent =
      teamsAheadCount === 0
        ? 92
        : Math.max(18, Math.round((1 / (teamsAheadCount + 1)) * 90));

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between bg-[#F2F4F6] p-4 sm:p-5 text-[#191F28]">
        <div className="space-y-3.5 pt-1">
          {/* 상단 미니 컨트롤 바: 평소에는 목록을 숨겨두고 우측 '내 주문 (N건) ▾' 버튼을 눌렀을 때만 펼쳐짐 */}
          <div className="relative">
            <div className="flex items-center justify-between px-0.5">
              <button
                type="button"
                onClick={() => setIsViewingMenu(true)}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-2 text-xs font-extrabold text-[#4E5968] shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition hover:bg-[#F9FAFB] hover:text-[#191F28]"
              >
                <Plus className="h-3.5 w-3.5 text-[#3182F6]" />
                추가 주문
              </button>

              <button
                type="button"
                onClick={() => setIsOrderListExpanded((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition ${
                  isOrderListExpanded
                    ? 'bg-[#3182F6] text-white'
                    : 'bg-white text-[#191F28] hover:bg-[#F9FAFB]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOrderListExpanded ? 'bg-white' : 'bg-[#3182F6]'
                  }`}
                />
                <span>내 주문 ({myOrders.length}건)</span>
                {isOrderListExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-[#8B95A1]" />
                )}
              </button>
            </div>

            {isOrderListExpanded && (
              <div className="mt-2.5 rounded-[24px] bg-white p-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.08)]">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-[#8B95A1]">
                    확인할 주문을 선택하세요
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsOrderListExpanded(false)}
                    className="rounded-lg p-1 text-[#8B95A1] hover:bg-[#F2F4F6] hover:text-[#191F28]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
                  {myOrders
                    .slice()
                    .reverse()
                    .map((ord) => {
                      const isSelected = ord.id === completedOrder.id;
                      const ordCups = ord.items.reduce(
                        (s, i) => s + i.quantity,
                        0
                      );
                      const firstItem = ord.items[0]?.menu_name || '메뉴';
                      const menuSummary =
                        ord.items.length > 1
                          ? `${firstItem} 외 ${ord.items.length - 1}건`
                          : firstItem;

                      const statusMeta =
                        ord.status === 'ready'
                          ? {
                              label: '제조완료 · 픽업대기 🎉',
                              badgeClass: 'bg-[#00C471] text-white',
                            }
                          : ord.status === 'preparing'
                            ? {
                                label: '제조 중 ☕',
                                badgeClass: 'bg-[#FFF8E6] text-[#D97706]',
                              }
                            : ord.status === 'pending'
                              ? {
                                  label: '주문 접수',
                                  badgeClass: 'bg-[#E8F3FF] text-[#3182F6]',
                                }
                              : ord.status === 'completed'
                                ? {
                                    label: '전달 완료 ✓',
                                    badgeClass: 'bg-[#F2F4F6] text-[#8B95A1]',
                                  }
                                : {
                                    label: '주문 취소',
                                    badgeClass: 'bg-[#FFEEEE] text-[#F04452]',
                                  };

                      return (
                        <button
                          key={ord.id}
                          type="button"
                          onClick={() => {
                            setDismissedFinishedIds((prev) =>
                              prev.filter((id) => id !== ord.id)
                            );
                            setSelectedOrderId(ord.id);
                            setIsOrderListExpanded(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border-2 px-3.5 py-2.5 text-left transition ${
                            isSelected
                              ? 'border-[#3182F6] bg-[#F4F8FF]'
                              : 'border-transparent bg-[#F9FAFB] hover:bg-[#F2F4F6]'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`shrink-0 rounded-xl px-2.5 py-1 font-mono text-sm font-black ${
                                isSelected
                                  ? 'bg-[#3182F6] text-white'
                                  : 'bg-white text-[#191F28] shadow-2xs'
                              }`}
                            >
                              #{ord.order_number}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-extrabold text-[#191F28]">
                                {menuSummary}{' '}
                                <span className="text-[#8B95A1]">
                                  ({ordCups}잔)
                                </span>
                              </p>
                              <p className="text-[11px] font-bold text-[#4E5968]">
                                {formatCurrency(ord.total_amount)}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`ml-2 shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-extrabold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* 실시간 상태 변경 알림 팝업 배너 */}
          {liveAlertBanner && (
            <div
              className={`flex items-center justify-between gap-2 rounded-2xl p-3.5 text-sm font-extrabold shadow-md transition-all ${
                completedOrder.status === 'ready'
                  ? 'animate-bounce bg-[#00C471] text-white'
                  : completedOrder.status === 'preparing'
                    ? 'bg-[#3182F6] text-white'
                    : completedOrder.status === 'cancelled'
                      ? 'bg-[#F04452] text-white'
                      : 'bg-[#191F28] text-white'
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

          {/* 대형 주문번호 & 현재 상태 메인 카드 (Toss 스타일) */}
          <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#8B95A1]">
              주문번호
            </p>
            <div className="mt-1.5 inline-flex items-baseline justify-center gap-1 rounded-3xl bg-[#E8F3FF] px-6 py-2.5">
              <span className="text-2xl font-black text-[#3182F6]">#</span>
              <span className="font-mono text-5xl font-black tracking-tight text-[#3182F6]">
                {completedOrder.order_number}
              </span>
            </div>

            <h1 className="mt-3.5 text-xl font-extrabold text-[#191F28]">
              {completedOrder.status === 'pending' && '주문이 접수되었어요'}
              {completedOrder.status === 'preparing' &&
                '음료를 정성껏 만들고 있어요 ☕'}
              {completedOrder.status === 'ready' &&
                '음료가 완성되었어요! 픽업해 주세요 🎉'}
              {completedOrder.status === 'completed' && '음료 전달이 완료되었어요'}
              {completedOrder.status === 'cancelled' && '주문이 취소되었어요'}
            </h1>

            {/* 심플 4단계 진행 바 */}
            {completedOrder.status !== 'cancelled' && (
              <div className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-[#F2F4F6] p-1.5">
                {statusSteps.map((step, idx) => {
                  const isActive = idx === currentStepIdx;
                  const isDone = idx < currentStepIdx;
                  return (
                    <div
                      key={step.key}
                      className={`flex items-center justify-center rounded-xl py-2.5 text-center text-xs font-extrabold transition ${
                        isActive
                          ? step.key === 'ready'
                            ? 'bg-[#00C471] text-white shadow-xs'
                            : 'bg-[#3182F6] text-white shadow-xs'
                          : isDone
                            ? 'bg-white text-[#3182F6]'
                            : 'text-[#8B95A1]'
                      }`}
                    >
                      {step.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 세련된 실시간 대기 순서 트래커 UI (Toss 카드 톤) */}
          {isMyOrderWaiting && (
            <div className="overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              {/* 상단 요약 헤더 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8F3FF] text-[#3182F6]">
                    <Coffee className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#8B95A1]">
                      실시간 내 순서
                    </p>
                    <p className="mt-0.5 text-base font-extrabold text-[#191F28]">
                      {teamsAheadCount === 0 ? (
                        <span className="text-[#00A859]">
                          내 앞 대기 없음 · 바로 제조 차례!
                        </span>
                      ) : (
                        <>
                          내 앞에{' '}
                          <span className="text-[#3182F6]">
                            {teamsAheadCount}팀
                          </span>{' '}
                          <span className="text-sm font-bold text-[#8B95A1]">
                            ({cupsAheadCount}잔)
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#F2F4F6] px-3.5 py-2 text-right">
                  <span className="block text-[10px] font-bold text-[#8B95A1]">
                    대기 순번
                  </span>
                  <span className="text-xs font-extrabold text-[#3182F6]">
                    {teamsAheadCount === 0
                      ? '1번째 (내 차례)'
                      : `${teamsAheadCount + 1}번째 순서`}
                  </span>
                </div>
              </div>

              {/* 진행 게이지 바 */}
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#F2F4F6]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#3182F6] to-[#00C471] transition-all duration-500"
                  style={{ width: `${queueProgressPercent}%` }}
                />
              </div>

              {/* 연결형 타임라인 대기열 카드 트랙 */}
              <div className="relative mt-4">
                <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                  {/* 1. 카운터 제조 바 */}
                  <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-[#191F28] px-3.5 py-2.5 text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3182F6]/20 text-[#64A8FF]">
                      <Coffee className="h-3.5 w-3.5" />
                    </span>
                    <span className="mt-1 text-[11px] font-extrabold text-white">
                      제조 바
                    </span>
                    <span className="text-[9px] font-bold text-[#8B95A1]">
                      카운터
                    </span>
                  </div>

                  {/* 2. 내 앞 대기 주문 카드들 */}
                  {ordersAhead.length <= 3 ? (
                    ordersAhead.map((aheadOrder) => {
                      const cupCnt = aheadOrder.items.reduce(
                        (s, i) => s + i.quantity,
                        0
                      );
                      const isPrep = aheadOrder.status === 'preparing';
                      return (
                        <div
                          key={aheadOrder.id}
                          className={`flex shrink-0 flex-col items-center justify-between rounded-2xl px-3.5 py-2 ${
                            isPrep ? 'bg-[#FFF8E6]' : 'bg-[#F2F4F6]'
                          }`}
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                              isPrep
                                ? 'bg-[#F59E0B] text-white'
                                : 'bg-white text-[#8B95A1]'
                            }`}
                          >
                            {isPrep ? '제조중' : '대기'}
                          </span>
                          <span className="mt-1 font-mono text-xs font-black text-[#191F28]">
                            #{aheadOrder.order_number}
                          </span>
                          <span className="text-[10px] font-bold text-[#4E5968]">
                            {cupCnt}잔
                          </span>
                        </div>
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
                            className={`flex shrink-0 flex-col items-center justify-between rounded-2xl px-3.5 py-2 ${
                              isPrep ? 'bg-[#FFF8E6]' : 'bg-[#F2F4F6]'
                            }`}
                          >
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                                isPrep
                                  ? 'bg-[#F59E0B] text-white'
                                  : 'bg-white text-[#8B95A1]'
                              }`}
                            >
                              {isPrep ? '제조중' : '대기'}
                            </span>
                            <span className="mt-1 font-mono text-xs font-black text-[#191F28]">
                              #{first.order_number}
                            </span>
                            <span className="text-[10px] font-bold text-[#4E5968]">
                              {firstCups}잔
                            </span>
                          </div>
                        );
                      })()}

                      <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-[#F2F4F6] px-3 py-2">
                        <span className="text-[11px] font-extrabold text-[#4E5968]">
                          +{ordersAhead.length - 2}팀
                        </span>
                        <span className="text-[9px] font-semibold text-[#8B95A1]">
                          대기 중
                        </span>
                      </div>

                      {(() => {
                        const prev = ordersAhead[ordersAhead.length - 1];
                        const prevCups = prev.items.reduce(
                          (s, i) => s + i.quantity,
                          0
                        );
                        return (
                          <div className="flex shrink-0 flex-col items-center justify-between rounded-2xl bg-[#F2F4F6] px-3.5 py-2">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-extrabold text-[#8B95A1]">
                              내 앞팀
                            </span>
                            <span className="mt-1 font-mono text-xs font-black text-[#191F28]">
                              #{prev.order_number}
                            </span>
                            <span className="text-[10px] font-bold text-[#4E5968]">
                              {prevCups}잔
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* 3. 내 주문 하이라이트 카드 */}
                  <div className="flex shrink-0 flex-col items-center justify-between rounded-2xl border-2 border-[#3182F6] bg-[#E8F3FF] px-4 py-2">
                    <span className="rounded-full bg-[#3182F6] px-2 py-0.5 text-[9px] font-extrabold text-white">
                      내 주문
                    </span>
                    <span className="mt-1 font-mono text-sm font-black text-[#3182F6]">
                      #{completedOrder.order_number}
                    </span>
                    <span className="text-[10px] font-extrabold text-[#1B64DA]">
                      {myCupsCount}잔
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 총 결제 금액 + 입금 계좌번호 통합 블록 (Toss 송금 카드 디자인) */}
          <div className="overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            {/* 상단: 총 결제 금액 및 주문자 정보 */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-[#8B95A1]">
                  총 결제 금액
                </span>
                <p className="mt-1 text-3xl font-black tracking-tight text-[#191F28]">
                  {formatCurrency(completedOrder.total_amount)}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#4E5968]">
                  {completedOrder.customer_name} · {completedOrder.phone}
                </p>
              </div>
              <span
                className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${
                  completedOrder.payment_method === 'transfer'
                    ? 'bg-[#E8F3FF] text-[#3182F6]'
                    : 'bg-[#E8FAF0] text-[#00A859]'
                }`}
              >
                {completedOrder.payment_method === 'transfer'
                  ? '계좌이체'
                  : '현금결제'}
              </span>
            </div>

            {/* 하단: 입금 계좌 안내 및 원클릭 복사 (동일 블록 내부에 통합) */}
            <div className="mt-4 rounded-2xl bg-[#F2F4F6] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-[#3182F6]">
                  입금 계좌 · {cafeSettings.bank_name}
                </span>
                <span className="font-semibold text-[#4E5968]">
                  예금주: {cafeSettings.account_holder}
                </span>
              </div>

              <p className="mt-1.5 font-mono text-xl font-black tracking-wider text-[#191F28]">
                {cafeSettings.account_number}
              </p>

              <button
                type="button"
                onClick={handleCopyAccount}
                className={`mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold shadow-xs transition active:scale-[0.99] ${
                  copied
                    ? 'bg-[#00C471] text-white'
                    : 'bg-[#3182F6] text-white hover:bg-[#1B64DA]'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    계좌번호가 복사되었어요!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    계좌번호 복사하기
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 주문 상세 내역 요약 */}
          <div className="rounded-[28px] bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <h3 className="mb-3 text-xs font-extrabold text-[#8B95A1]">
              주문한 메뉴
            </h3>
            <ul className="divide-y divide-[#F2F4F6] text-sm">
              {completedOrder.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-2.5 font-semibold text-[#191F28]"
                >
                  <span>
                    {item.menu_name}{' '}
                    {item.temp_option !== 'NONE' && (
                      <span
                        className={`ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
                          item.temp_option === 'HOT'
                            ? 'bg-[#FFEEEE] text-[#F04452]'
                            : 'bg-[#E8F3FF] text-[#3182F6]'
                        }`}
                      >
                        {item.temp_option}
                      </span>
                    )}
                  </span>
                  <span className="font-extrabold text-[#191F28]">
                    {item.quantity}개 · {formatCurrency(item.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2 pt-4">
          {/* 기존 주문을 절대 삭제하지 않고 메뉴판으로 전환 */}
          <button
            type="button"
            onClick={() => {
              setIsViewingMenu(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#191F28] py-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#333D4B]"
          >
            <Plus className="h-4 w-4 text-[#64A8FF]" />
            {isOrderFinished
              ? '메뉴판으로 돌아가기'
              : '추가 주문하기 (메뉴판 보기)'}
          </button>
        </div>
      </div>
    );
  }

  const myActiveOrders = myOrders.filter(
    (o) => o.status !== 'completed' && o.status !== 'cancelled'
  );

  // ==========================================================================
  // 기본 메뉴 선택 화면 (모바일 세로형 - Toss 스타일)
  // ==========================================================================
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-[#F2F4F6] pb-28 text-[#191F28]">
      {/* 진행 중인 내 주문이 있을 때 언제든 다시 대기 화면으로 돌아갈 수 있는 상단 고정 바 */}
      {myActiveOrders.length > 0 && (
        <div className="sticky top-0 z-30 bg-[#191F28] px-4 py-3 text-white shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="flex h-2.5 w-2.5 shrink-0 animate-ping rounded-full bg-[#00C471]" />
              <span className="truncate text-xs font-extrabold">
                진행 중 내 주문 {myActiveOrders.length}건 (
                {myActiveOrders.map((o) => `#${o.order_number}`).join(', ')})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedOrderId(
                  myActiveOrders[myActiveOrders.length - 1].id
                );
                setIsViewingMenu(false);
              }}
              className="shrink-0 rounded-xl bg-[#3182F6] px-3 py-1.5 text-xs font-extrabold text-white shadow-2xs hover:bg-[#1B64DA]"
            >
              주문 상태 보기 →
            </button>
          </div>
        </div>
      )}

      {/* 상단 헤더 */}
      <header className="sticky top-0 z-20 border-b border-[#E5E8EB] bg-white/95 backdrop-blur-xs">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#3182F6] text-white">
              <Coffee className="h-5 w-5" />
            </div>
            <h1 className="text-base font-extrabold text-[#191F28]">
              {cafeSettings.cafe_name}
            </h1>
          </div>

          {/* 오늘 내가 주문한 내역(영수증 리스트) 열기 버튼 */}
          {myOrders.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedReceiptOrder(null);
                setIsHistoryOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-2xl bg-[#F2F4F6] px-3 py-1.5 text-xs font-extrabold text-[#4E5968] hover:bg-[#E5E8EB]"
            >
              🧾 내 주문내역 ({myOrders.length})
            </button>
          )}
        </div>

        {/* 카테고리 탭 */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`shrink-0 rounded-2xl px-3.5 py-1.5 text-xs font-extrabold transition ${
              selectedCategory === 'all'
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
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-2xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                selectedCategory === cat.id
                  ? 'bg-[#191F28] text-white'
                  : 'bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* QR 주문 마감(예배시간/준비중) 전체 화면 오버레이 배너 (임팩트 있는 안내) */}
      {isQrOrderPaused && (
        <div className="mx-4 mt-4 overflow-hidden rounded-[28px] border-2 border-[#F04452] bg-white p-5 text-center shadow-[0_8px_30px_rgba(240,68,82,0.12)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFEEEE] text-[#F04452]">
            <BellRing className="h-7 w-7 animate-bounce" />
          </div>
          <span className="mt-3 inline-block rounded-full bg-[#FFEEEE] px-3 py-1 text-xs font-black text-[#F04452]">
            주문 접수 일시 마감
          </span>
          <h2 className="mt-2 text-lg font-black text-[#191F28]">
            지금은 모바일 주문을 받지 않고 있어요
          </h2>
          <p className="mt-1.5 text-xs font-bold leading-relaxed text-[#4E5968]">
            {cafeSettings.qr_pause_message ||
              '예배 시간 또는 재료 준비 중입니다. 잠시 후 다시 확인해 주시거나 카운터로 문의해 주세요.'}
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
                  dotClass: 'bg-[#00C471]',
                  badgeClass: 'bg-[#E8FAF0] text-[#00A859]',
                }
              : totalWaitingTeams <= 2
                ? {
                    label: '여유',
                    dotClass: 'bg-[#00C471]',
                    badgeClass: 'bg-[#E8FAF0] text-[#00A859]',
                  }
                : totalWaitingTeams <= 5
                  ? {
                      label: '보통',
                      dotClass: 'bg-[#F59E0B]',
                      badgeClass: 'bg-[#FFF8E6] text-[#D97706]',
                    }
                  : {
                      label: '혼잡',
                      dotClass: 'bg-[#F04452]',
                      badgeClass: 'bg-[#FFEEEE] text-[#F04452]',
                    };

          return (
            <div className="mx-4 mt-3.5 rounded-[24px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E8F3FF] text-[#3182F6]">
                    <Coffee className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${congestion.dotClass}`}
                      />
                      <span className="text-[11px] font-bold text-[#8B95A1]">
                        실시간 매장 대기 현황
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-extrabold text-[#191F28]">
                      {totalWaitingTeams === 0 ? (
                        <span className="text-[#00A859]">
                          대기 없음 · 주문 즉시 제조 시작!
                        </span>
                      ) : (
                        <>
                          현재 대기{' '}
                          <span className="text-[#3182F6]">
                            {totalWaitingTeams}팀
                          </span>{' '}
                          <span className="text-[#8B95A1]">
                            (총 {totalWaitingCups}잔)
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-extrabold ${congestion.badgeClass}`}
                >
                  {congestion.label}
                </span>
              </div>

              {/* 대기 중인 주문이 있을 때만 깔끔한 카드 트랙 표시 */}
              {totalWaitingTeams > 0 && (
                <div className="mt-3 flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-[#F2F4F6] p-2">
                  {activeQueueOrders.slice(0, 3).map((o) => {
                    const cupCnt = o.items.reduce((s, i) => s + i.quantity, 0);
                    const isPrep = o.status === 'preparing';
                    return (
                      <div
                        key={o.id}
                        className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold ${
                          isPrep
                            ? 'bg-[#FFF8E6] text-[#D97706]'
                            : 'bg-white text-[#4E5968]'
                        }`}
                      >
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold ${
                            isPrep
                              ? 'bg-[#F59E0B] text-white'
                              : 'bg-[#F2F4F6] text-[#8B95A1]'
                          }`}
                        >
                          {isPrep ? '제조중' : '대기'}
                        </span>
                        <span className="font-mono text-[#191F28]">
                          #{o.order_number}
                        </span>
                        <span className="text-[10px] font-bold text-[#8B95A1]">
                          {cupCnt}잔
                        </span>
                      </div>
                    );
                  })}

                  {activeQueueOrders.length > 3 && (
                    <span className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-[10px] font-extrabold text-[#4E5968]">
                      +{activeQueueOrders.length - 3}팀
                    </span>
                  )}

                  <div className="ml-auto flex shrink-0 items-center gap-1 rounded-xl bg-[#3182F6] px-2.5 py-1.5 text-[10px] font-extrabold text-white">
                    지금 주문 시 {totalWaitingTeams + 1}번째
                  </div>
                </div>
              )}
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
              disabled={isSoldOut || isQrOrderPaused}
              onClick={() => handleMenuClick(menu)}
              className={`relative flex w-full items-center justify-between rounded-[22px] p-4 text-left transition ${
                isSoldOut || isQrOrderPaused
                  ? 'cursor-not-allowed bg-white/60 opacity-60'
                  : 'bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] active:scale-[0.99] hover:ring-2 hover:ring-[#3182F6]/30'
              }`}
            >
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`text-base font-extrabold ${
                      isSoldOut
                        ? 'text-[#8B95A1] line-through'
                        : 'text-[#191F28]'
                    }`}
                  >
                    {menu.name}
                  </span>
                  {menu.is_new && !isSoldOut && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E8F3FF] px-2 py-0.5 text-[10px] font-extrabold text-[#3182F6]">
                      <Sparkles className="h-2.5 w-2.5" /> NEW
                    </span>
                  )}
                  {isSoldOut && (
                    <span className="rounded-lg bg-[#FFEEEE] px-2 py-0.5 text-[11px] font-extrabold text-[#F04452]">
                      품절
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  {menu.has_temp_option ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-[#8B95A1]">
                      <span className="text-[#F04452]">HOT</span> /{' '}
                      <span className="text-[#3182F6]">ICE</span> 선택 가능
                    </span>
                  ) : menu.default_temp !== 'NONE' ? (
                    <span
                      className={`font-bold ${
                        menu.default_temp === 'HOT'
                          ? 'text-[#F04452]'
                          : 'text-[#3182F6]'
                      }`}
                    >
                      {menu.default_temp} 전용
                    </span>
                  ) : (
                    <span className="text-[#8B95A1]">디저트/단품</span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`text-base font-black ${
                    isSoldOut ? 'text-[#8B95A1]' : 'text-[#191F28]'
                  }`}
                >
                  {formatCurrency(menu.price)}
                </span>
                {!isSoldOut && (
                  <div className="mt-1 text-[11px] font-extrabold text-[#3182F6]">
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
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-md rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-[#191F28]">
                  {optionModalMenu.name}
                </h3>
                <p className="mt-0.5 text-sm font-extrabold text-[#3182F6]">
                  {formatCurrency(optionModalMenu.price)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOptionModalMenu(null)}
                className="rounded-full bg-[#F2F4F6] p-2 text-[#4E5968]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Hot / Ice 선택 */}
            {optionModalMenu.has_temp_option ? (
              <div className="mt-5">
                <label className="block text-xs font-extrabold text-[#4E5968]">
                  온도 선택
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedTemp('ICE')}
                    className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-base font-extrabold transition ${
                      selectedTemp === 'ICE'
                        ? 'border-[#3182F6] bg-[#E8F3FF] text-[#3182F6]'
                        : 'border-transparent bg-[#F2F4F6] text-[#8B95A1]'
                    }`}
                  >
                    <Snowflake className="h-5 w-5" />
                    시원한 ICE
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTemp('HOT')}
                    className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-base font-extrabold transition ${
                      selectedTemp === 'HOT'
                        ? 'border-[#F04452] bg-[#FFEEEE] text-[#F04452]'
                        : 'border-transparent bg-[#F2F4F6] text-[#8B95A1]'
                    }`}
                  >
                    <Flame className="h-5 w-5" />
                    따뜻한 HOT
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-[#F2F4F6] px-3.5 py-2.5 text-xs font-bold text-[#4E5968]">
                {optionModalMenu.default_temp === 'NONE'
                  ? '온도 옵션이 없는 메뉴입니다.'
                  : `이 메뉴는 ${optionModalMenu.default_temp} 전용 메뉴입니다.`}
              </div>
            )}

            {/* 수량 선택 */}
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#F2F4F6] p-4">
              <span className="text-sm font-extrabold text-[#191F28]">
                수량 선택
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedQty((q) => Math.max(1, q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#191F28] shadow-2xs active:scale-95"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-lg font-black text-[#191F28]">
                  {selectedQty}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedQty((q) => q + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#191F28] shadow-2xs active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              className="mt-6 w-full rounded-2xl bg-[#3182F6] py-4 text-base font-extrabold text-white shadow-md transition hover:bg-[#1B64DA] active:scale-[0.99]"
            >
              {formatCurrency(optionModalMenu.price * selectedQty)} 담기
            </button>
          </div>
        </div>
      )}

      {/* 하단 고정 장바구니 바 (Toss Primary CTA Bar) */}
      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-md border-t border-[#E5E8EB] bg-white/95 p-4 backdrop-blur-xs">
          <button
            type="button"
            onClick={() => setIsCheckoutOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-[#3182F6] px-5 py-4 text-white shadow-lg transition hover:bg-[#1B64DA] active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-[#3182F6]">
                {totalCount}
              </div>
              <span className="text-base font-extrabold">주문하기</span>
            </div>
            <span className="text-lg font-black">
              {formatCurrency(totalAmount)}
            </span>
          </button>
        </div>
      )}

      {/* 주문자 정보 입력 및 최종 주문 바텀시트 */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
            <div className="flex items-center justify-between border-b border-[#F2F4F6] px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#191F28]">
                <ShoppingBag className="h-5 w-5 text-[#3182F6]" />
                주문 확인
              </h2>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="rounded-full bg-[#F2F4F6] p-1.5 text-[#4E5968]"
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
                <label className="block text-xs font-extrabold text-[#8B95A1]">
                  선택한 메뉴 ({totalCount}개)
                </label>
                <div className="divide-y divide-white rounded-2xl bg-[#F2F4F6] px-4">
                  {cart.map((item) => (
                    <div
                      key={item.cartKey}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <span className="text-sm font-extrabold text-[#191F28]">
                          {item.menu.name}
                        </span>
                        {item.temp_option !== 'NONE' && (
                          <span
                            className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                              item.temp_option === 'HOT'
                                ? 'bg-[#FFEEEE] text-[#F04452]'
                                : 'bg-[#E8F3FF] text-[#3182F6]'
                            }`}
                          >
                            {item.temp_option}
                          </span>
                        )}
                        <p className="text-xs font-semibold text-[#4E5968]">
                          {formatCurrency(item.menu.price * item.quantity)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.cartKey, -1)}
                          className="rounded-lg bg-white p-1.5 text-[#4E5968] shadow-2xs"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center text-sm font-black text-[#191F28]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.cartKey, 1)}
                          className="rounded-lg bg-white p-1.5 text-[#4E5968] shadow-2xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCartQty(item.cartKey, -item.quantity)
                          }
                          className="ml-1 text-[#F04452]"
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
                  <label className="block text-xs font-extrabold text-[#4E5968]">
                    주문자 이름 *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 홍길동"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] px-4 py-3.5 text-base font-bold text-[#191F28] focus:border-[#3182F6] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[#4E5968]">
                    휴대폰 번호 *
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    required
                    placeholder="010-1234-5678"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    className="mt-1.5 w-full rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] px-4 py-3.5 text-lg font-black tracking-wider text-[#191F28] focus:border-[#3182F6] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* 결제 예정 수단 선택 */}
              <div>
                <label className="block text-xs font-extrabold text-[#4E5968]">
                  결제 수단 *
                </label>
                <div className="mt-1.5 flex gap-2.5">
                  {cafeSettings.allow_transfer !== false && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transfer')}
                      className={`flex-1 rounded-2xl border-2 py-3.5 text-sm font-extrabold transition ${
                        paymentMethod === 'transfer'
                          ? 'border-[#3182F6] bg-[#E8F3FF] text-[#3182F6]'
                          : 'border-transparent bg-[#F2F4F6] text-[#8B95A1]'
                      }`}
                    >
                      계좌이체
                    </button>
                  )}
                  {cafeSettings.allow_cash !== false && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`flex-1 rounded-2xl border-2 py-3.5 text-sm font-extrabold transition ${
                        paymentMethod === 'cash'
                          ? 'border-[#00C471] bg-[#E8FAF0] text-[#00A859]'
                          : 'border-transparent bg-[#F2F4F6] text-[#8B95A1]'
                      }`}
                    >
                      현금결제 (카운터)
                    </button>
                  )}
                </div>
              </div>

              {/* 총 결제 금액 & 주문 완료 버튼 */}
              <div className="border-t border-[#F2F4F6] pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-[#4E5968]">
                    총 결제 금액
                  </span>
                  <span className="text-2xl font-black text-[#3182F6]">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting || cart.length === 0}
                  className="w-full rounded-2xl bg-[#3182F6] py-4 text-base font-extrabold text-white shadow-md transition hover:bg-[#1B64DA] disabled:bg-[#E5E8EB]"
                >
                  {submitting ? '주문 전송 중...' : '주문 접수하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 내 주문 내역 (과거 주문 리스트 & 영수증 보기 모달 - 5초 자동 닫힘 없음) */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center">
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
            <div className="flex items-center justify-between border-b border-[#F2F4F6] px-5 py-4">
              <div className="flex items-center gap-2">
                {selectedReceiptOrder && (
                  <button
                    type="button"
                    onClick={() => setSelectedReceiptOrder(null)}
                    className="rounded-xl bg-[#F2F4F6] px-2.5 py-1 text-xs font-extrabold text-[#4E5968] hover:bg-[#E5E8EB]"
                  >
                    ← 목록
                  </button>
                )}
                <h2 className="text-base font-extrabold text-[#191F28]">
                  {selectedReceiptOrder
                    ? `주문 #${selectedReceiptOrder.order_number} 영수증`
                    : `내 주문 내역 (${myOrders.length}건)`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsHistoryOpen(false);
                  setSelectedReceiptOrder(null);
                }}
                className="rounded-full bg-[#F2F4F6] p-1.5 text-[#4E5968] hover:bg-[#E5E8EB]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {selectedReceiptOrder ? (
                /* 상세 영수증 화면 */
                <div className="rounded-3xl bg-[#F2F4F6] p-5">
                  <div className="border-b border-dashed border-[#D1D6DB] pb-3.5 text-center">
                    <p className="text-xs font-bold text-[#8B95A1]">
                      {cafeSettings.cafe_name}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-black text-[#191F28]">
                      주문번호 #{selectedReceiptOrder.order_number}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-[#8B95A1]">
                      {new Date(selectedReceiptOrder.created_at).toLocaleString(
                        'ko-KR',
                        {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}
                    </p>
                  </div>

                  {/* 주문자 요약 */}
                  <div className="space-y-1.5 border-b border-dashed border-[#D1D6DB] py-3 text-xs">
                    <div className="flex justify-between">
                      <span className="font-semibold text-[#8B95A1]">주문자</span>
                      <span className="font-extrabold text-[#191F28]">
                        {selectedReceiptOrder.customer_name} (
                        {selectedReceiptOrder.phone})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[#8B95A1]">
                        결제방식
                      </span>
                      <span className="font-extrabold text-[#191F28]">
                        {selectedReceiptOrder.payment_method === 'transfer'
                          ? '계좌이체'
                          : '현금결제'}
                      </span>
                    </div>
                  </div>

                  {/* 품목 내역 */}
                  <div className="divide-y divide-[#E5E8EB] py-2">
                    {selectedReceiptOrder.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-2.5 text-sm"
                      >
                        <div>
                          <span className="font-extrabold text-[#191F28]">
                            {item.menu_name}
                          </span>
                          {item.temp_option !== 'NONE' && (
                            <span className="ml-1.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#4E5968]">
                              {item.temp_option}
                            </span>
                          )}
                          <span className="ml-1.5 text-xs font-bold text-[#8B95A1]">
                            × {item.quantity}
                          </span>
                        </div>
                        <span className="font-mono font-extrabold text-[#191F28]">
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 합계 */}
                  <div className="mt-2 flex items-center justify-between border-t-2 border-[#191F28] pt-3.5">
                    <span className="text-sm font-extrabold text-[#191F28]">
                      총 합계 (
                      {selectedReceiptOrder.items.reduce(
                        (s, i) => s + i.quantity,
                        0
                      )}
                      개)
                    </span>
                    <span className="text-xl font-black text-[#3182F6]">
                      {formatCurrency(selectedReceiptOrder.total_amount)}
                    </span>
                  </div>
                </div>
              ) : (
                /* 과거 주문 기록 줄줄이 리스트 */
                <div className="space-y-2.5">
                  {myOrders
                    .slice()
                    .reverse()
                    .map((ord) => {
                      const totalCups = ord.items.reduce(
                        (s, i) => s + i.quantity,
                        0
                      );
                      const firstItemName =
                        ord.items[0]?.menu_name || '주문 메뉴';
                      const summaryTitle =
                        ord.items.length > 1
                          ? `${firstItemName} 외 ${ord.items.length - 1}건`
                          : firstItemName;
                      const timeStr = new Date(
                        ord.created_at
                      ).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      const statusBadge =
                        ord.status === 'ready'
                          ? {
                              label: '제조완료 · 픽업대기 🎉',
                              cls: 'bg-[#00C471] text-white',
                            }
                          : ord.status === 'preparing'
                            ? {
                                label: '제조 중 ☕',
                                cls: 'bg-[#FFF8E6] text-[#D97706]',
                              }
                            : ord.status === 'pending'
                              ? {
                                  label: '주문 접수',
                                  cls: 'bg-[#E8F3FF] text-[#3182F6]',
                                }
                              : ord.status === 'completed'
                                ? {
                                    label: '수령 완료 ✓',
                                    cls: 'bg-[#E5E8EB] text-[#4E5968]',
                                  }
                                : {
                                    label: '취소됨',
                                    cls: 'bg-[#FFEEEE] text-[#F04452]',
                                  };

                      return (
                        <button
                          key={ord.id}
                          type="button"
                          onClick={() => setSelectedReceiptOrder(ord)}
                          className="flex w-full items-center justify-between rounded-2xl bg-[#F2F4F6] p-4 text-left transition hover:bg-[#E5E8EB]/70"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-lg bg-[#191F28] px-2.5 py-0.5 font-mono text-xs font-black text-white">
                                #{ord.order_number}
                              </span>
                              <span className="text-xs font-semibold text-[#8B95A1]">
                                {timeStr}
                              </span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${statusBadge.cls}`}
                              >
                                {statusBadge.label}
                              </span>
                            </div>
                            <p className="mt-1.5 truncate text-sm font-extrabold text-[#191F28]">
                              {summaryTitle}{' '}
                              <span className="text-xs font-bold text-[#8B95A1]">
                                (총 {totalCups}개)
                              </span>
                            </p>
                          </div>

                          <div className="ml-3 shrink-0 text-right">
                            <p className="text-base font-black text-[#191F28]">
                              {formatCurrency(ord.total_amount)}
                            </p>
                            <span className="text-[11px] font-extrabold text-[#3182F6]">
                              영수증 보기 →
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
