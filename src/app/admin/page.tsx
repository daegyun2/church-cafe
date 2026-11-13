'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_CAFE_SETTINGS, formatCurrency } from '@/lib/config';
import { generateQrMatrix } from '@/lib/qrcode';
import {
  clearOrderRecords,
  fetchCafeSettings,
  fetchTodayOrders,
  subscribeCafeRealtime,
} from '@/lib/store';
import { CafeSettings, Order } from '@/types/cafe';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Delete,
  Download,
  Lock,
  MessageSquareShare,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

interface MenuSalesStat {
  menuName: string;
  hotQty: number;
  iceQty: number;
  noneQty: number;
  totalQty: number;
  totalRevenue: number;
}

export default function AdminSettlementPage() {
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(
    DEFAULT_CAFE_SETTINGS
  );
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  // 액션 피드백 및 모달 상태
  const [copiedKakao, setCopiedKakao] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [adminUrl, setAdminUrl] = useState('');

  // 주문 기록 비우기(초기화) PIN 재확인 모달 상태
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearMode, setClearMode] = useState<'completed_cancelled' | 'all'>(
    'completed_cancelled'
  );
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [confirmPinError, setConfirmPinError] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadSettings = useCallback(async () => {
    const s = await fetchCafeSettings();
    setCafeSettings(s);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [s, data] = await Promise.all([
        fetchCafeSettings(),
        fetchTodayOrders(),
      ]);
      setCafeSettings(s);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAdminUrl(`${window.location.origin}/admin`);
    }
    loadSettings();
    const unsubscribe = subscribeCafeRealtime(() => {
      loadSettings();
      if (unlocked) {
        loadOrders();
      }
    });
    return () => unsubscribe();
  }, [unlocked, loadSettings, loadOrders]);

  useEffect(() => {
    if (unlocked) {
      loadOrders();
    }
  }, [unlocked, loadOrders]);

  const handleDigitPress = (digit: string) => {
    setPinError(false);
    if (pinInput.length >= 4) return;
    const nextPin = pinInput + digit;
    setPinInput(nextPin);

    if (nextPin.length === 4) {
      if (nextPin === cafeSettings.admin_pin) {
        setUnlocked(true);
      } else {
        setPinError(true);
        setTimeout(() => setPinInput(''), 500);
      }
    }
  };

  const handleBackspace = () => {
    setPinError(false);
    setPinInput((prev) => prev.slice(0, -1));
  };

  // ==========================================================================
  // 정산 데이터 계산
  // ==========================================================================
  const completedOrders = orders.filter((o) => o.status === 'completed');
  const activeOrders = orders.filter(
    (o) =>
      o.status === 'pending' || o.status === 'preparing' || o.status === 'ready'
  );
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  const totalSalesAmount = completedOrders.reduce(
    (sum, o) => sum + o.total_amount,
    0
  );

  const transferOrders = completedOrders.filter(
    (o) => o.payment_method === 'transfer'
  );
  const cashOrders = completedOrders.filter((o) => o.payment_method === 'cash');

  const transferSalesAmount = transferOrders.reduce(
    (sum, o) => sum + o.total_amount,
    0
  );
  const cashSalesAmount = cashOrders.reduce(
    (sum, o) => sum + o.total_amount,
    0
  );

  const transferRatio =
    totalSalesAmount > 0
      ? Math.round((transferSalesAmount / totalSalesAmount) * 100)
      : 0;
  const cashRatio =
    totalSalesAmount > 0
      ? Math.round((cashSalesAmount / totalSalesAmount) * 100)
      : 0;

  const menuSalesList = useMemo(() => {
    const menuStatsMap = new Map<string, MenuSalesStat>();
    for (const order of completedOrders) {
      for (const item of order.items) {
        const existing = menuStatsMap.get(item.menu_name) || {
          menuName: item.menu_name,
          hotQty: 0,
          iceQty: 0,
          noneQty: 0,
          totalQty: 0,
          totalRevenue: 0,
        };
        if (item.temp_option === 'HOT') existing.hotQty += item.quantity;
        else if (item.temp_option === 'ICE') existing.iceQty += item.quantity;
        else existing.noneQty += item.quantity;

        existing.totalQty += item.quantity;
        existing.totalRevenue += item.subtotal;
        menuStatsMap.set(item.menu_name, existing);
      }
    }
    return Array.from(menuStatsMap.values()).sort(
      (a, b) => b.totalQty - a.totalQty || b.totalRevenue - a.totalRevenue
    );
  }, [completedOrders]);

  const totalSoldCups = menuSalesList.reduce((s, m) => s + m.totalQty, 0);

  const todayFormatted = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const todayIsoDate = new Date().toISOString().slice(0, 10);

  // ==========================================================================
  // 1. 카톡용 정산 텍스트 생성 및 복사
  // ==========================================================================
  const kakaoSummaryText = useMemo(() => {
    const lines: string[] = [
      `📊 [${cafeSettings.cafe_name} 일일 정산 보고]`,
      `📅 일자: ${todayFormatted}`,
      `────────────────`,
      `💰 오늘 총 매출: ${formatCurrency(totalSalesAmount)}`,
      `   (완료 ${completedOrders.length}건 / 총 ${totalSoldCups}잔·개)`,
      `• 계좌이체: ${formatCurrency(transferSalesAmount)} (${transferOrders.length}건 / ${transferRatio}%)`,
      `• 현금결제: ${formatCurrency(cashSalesAmount)} (${cashOrders.length}건 / ${cashRatio}%)`,
      `• 주문취소: ${cancelledOrders.length}건`,
      `────────────────`,
      `☕ [메뉴별 판매 수량]`,
    ];

    if (menuSalesList.length === 0) {
      lines.push(`- 판매 완료 내역 없음`);
    } else {
      menuSalesList.forEach((stat, idx) => {
        const optParts: string[] = [];
        if (stat.iceQty > 0) optParts.push(`ICE ${stat.iceQty}`);
        if (stat.hotQty > 0) optParts.push(`HOT ${stat.hotQty}`);
        if (stat.noneQty > 0) optParts.push(`단품 ${stat.noneQty}`);
        const optStr = optParts.length > 0 ? ` (${optParts.join(', ')})` : '';
        lines.push(
          `${idx + 1}. ${stat.menuName}: ${stat.totalQty}개${optStr} - ${formatCurrency(stat.totalRevenue)}`
        );
      });
    }

    return lines.join('\n');
  }, [
    cafeSettings.cafe_name,
    todayFormatted,
    totalSalesAmount,
    completedOrders.length,
    totalSoldCups,
    transferSalesAmount,
    transferOrders.length,
    transferRatio,
    cashSalesAmount,
    cashOrders.length,
    cashRatio,
    cancelledOrders.length,
    menuSalesList,
  ]);

  const handleCopyKakaoText = async () => {
    try {
      await navigator.clipboard.writeText(kakaoSummaryText);
      setCopiedKakao(true);
      setTimeout(() => setCopiedKakao(false), 3000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = kakaoSummaryText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedKakao(true);
      setTimeout(() => setCopiedKakao(false), 3000);
    }
  };

  // ==========================================================================
  // 2. 한글 깨짐 방지(UTF-8 BOM) 엑셀 CSV 생성 & 다운로드 & Web Share API 공유
  // ==========================================================================
  const buildCsvContent = useCallback((): string => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows: (string | number)[][] = [
      [`[${cafeSettings.cafe_name} 일일 정산 보고서]`],
      ['정산 일자', todayFormatted],
      ['오늘 총 매출액(완료 기준)', totalSalesAmount],
      ['완료 주문 건수', completedOrders.length],
      ['총 판매 수량(잔/개)', totalSoldCups],
      [
        '계좌이체 매출액',
        transferSalesAmount,
        `(${transferOrders.length}건 / ${transferRatio}%)`,
      ],
      [
        '현금결제 매출액',
        cashSalesAmount,
        `(${cashOrders.length}건 / ${cashRatio}%)`,
      ],
      ['주문 취소 건수', cancelledOrders.length],
      [],
      ['[메뉴별 판매 수량 집계]'],
      [
        '순위',
        '메뉴명',
        'ICE 수량',
        'HOT 수량',
        '단품/기타 수량',
        '총 판매 수량',
        '판매 금액(원)',
      ],
    ];

    menuSalesList.forEach((stat, idx) => {
      rows.push([
        idx + 1,
        stat.menuName,
        stat.iceQty,
        stat.hotQty,
        stat.noneQty,
        stat.totalQty,
        stat.totalRevenue,
      ]);
    });

    rows.push([]);
    rows.push(['[오늘 전체 주문 상세 내역]']);
    rows.push([
      '주문번호',
      '주문시각',
      '주문자명',
      '연락처',
      '결제수단',
      '상태',
      '접수경로',
      '주문 메뉴 상세',
      '총 금액(원)',
    ]);

    orders.forEach((o) => {
      const timeStr = new Date(o.created_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const payLabel = o.payment_method === 'transfer' ? '계좌이체' : '현금결제';
      const statusLabel =
        o.status === 'completed'
          ? '완료'
          : o.status === 'cancelled'
            ? '취소됨(매출제외)'
            : '대기/제조중';
      const sourceLabel = o.order_source === 'qr' ? 'QR모바일' : '카운터POS';
      const itemSummary = o.items
        .map(
          (i) =>
            `${i.menu_name}${
              i.temp_option !== 'NONE' ? `(${i.temp_option})` : ''
            }x${i.quantity}`
        )
        .join(' / ');

      rows.push([
        `#${o.order_number}`,
        timeStr,
        o.customer_name,
        o.phone,
        payLabel,
        statusLabel,
        sourceLabel,
        itemSummary,
        o.total_amount,
      ]);
    });

    // UTF-8 BOM (\uFEFF) 추가로 엑셀에서 한글 깨짐 완벽 방지
    return (
      '\uFEFF' + rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
    );
  }, [
    cafeSettings.cafe_name,
    todayFormatted,
    totalSalesAmount,
    completedOrders.length,
    totalSoldCups,
    transferSalesAmount,
    transferOrders.length,
    transferRatio,
    cashSalesAmount,
    cashOrders.length,
    cashRatio,
    cancelledOrders.length,
    menuSalesList,
    orders,
  ]);

  const handleDownloadCsv = () => {
    const csvContent = buildCsvContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeCafeName = cafeSettings.cafe_name.replace(/\s+/g, '_');
    link.href = url;
    link.setAttribute('download', `${safeCafeName}_일일정산_${todayIsoDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ==========================================================================
  // 3. 이전 주문 기록 비우기(초기화) 핸들러 (PIN 재확인)
  // ==========================================================================
  const handleConfirmClearOrders = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmPinInput !== cafeSettings.admin_pin) {
      setConfirmPinError(true);
      return;
    }

    setClearing(true);
    try {
      const deletedCount = await clearOrderRecords(clearMode);
      await loadOrders();
      setClearModalOpen(false);
      setConfirmPinInput('');
      setConfirmPinError(false);
      alert(`총 ${deletedCount}건의 주문 기록이 깔끔하게 정리되었습니다.`);
    } catch (err) {
      console.error(err);
      alert('주문 기록 정리 중 오류가 발생했습니다.');
    } finally {
      setClearing(false);
    }
  };

  // QR 매트릭스 생성
  const qrMatrix = useMemo(() => {
    const target = adminUrl || 'https://localhost:3000/admin';
    return generateQrMatrix(target);
  }, [adminUrl]);

  // ==========================================================================
  // 잠금 화면 (4자리 PIN 입력)
  // ==========================================================================
  if (!unlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F2F4F6] p-6 text-[#191F28]">
        <div className="w-full max-w-sm rounded-[28px] bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F3FF] text-[#3182F6]">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-black text-[#191F28]">일일 정산 관리자 잠금</h1>
            <p className="mt-1 text-xs font-semibold text-[#8B95A1]">
              {cafeSettings.cafe_name} 4자리 관리자 PIN 번호를 입력해 주세요
            </p>
          </div>

          <div className="my-7 flex justify-center gap-4">
            {[0, 1, 2, 3].map((idx) => {
              const filled = idx < pinInput.length;
              return (
                <div
                  key={idx}
                  className={`h-3.5 w-3.5 rounded-full transition-all ${
                    pinError
                      ? 'bg-[#F04452] scale-110'
                      : filled
                        ? 'bg-[#3182F6] scale-110'
                        : 'bg-[#E5E8EB]'
                  }`}
                />
              );
            })}
          </div>

          {pinError && (
            <p className="mb-4 text-center text-xs font-bold text-[#F04452]">
              PIN 번호가 일치하지 않습니다. 다시 입력해 주세요.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitPress(digit)}
                className="rounded-2xl bg-[#F2F4F6] py-3.5 text-xl font-black text-[#191F28] transition hover:bg-[#E5E8EB] active:scale-95"
              >
                {digit}
              </button>
            ))}
            <Link
              href="/pos"
              className="flex items-center justify-center rounded-2xl bg-[#F2F4F6] py-3.5 text-xs font-extrabold text-[#4E5968] hover:bg-[#E5E8EB] hover:text-[#191F28]"
            >
              POS로
            </Link>
            <button
              type="button"
              onClick={() => handleDigitPress('0')}
              className="rounded-2xl bg-[#F2F4F6] py-3.5 text-xl font-black text-[#191F28] transition hover:bg-[#E5E8EB] active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="flex items-center justify-center rounded-2xl bg-[#F2F4F6] py-3.5 text-[#4E5968] hover:bg-[#E5E8EB] active:scale-95"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F4F6] p-4 sm:p-6 md:p-10 text-[#191F28]">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* 상단 헤더 */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[26px] bg-white px-6 py-4 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#00A859]">
              <BarChart3 className="h-4 w-4" />
              <span>{todayFormatted}</span>
            </div>
            <h1 className="mt-0.5 text-2xl font-black text-[#191F28]">
              {cafeSettings.cafe_name} 일일 정산 대시보드
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadOrders}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#F2F4F6] px-3.5 py-2 text-xs font-extrabold text-[#4E5968] hover:bg-[#E5E8EB]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              새로고침
            </button>

            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#3182F6] px-4 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-[#1B64DA]"
            >
              <MonitorSmartphone className="h-4 w-4" />
              카운터 POS로 이동
            </Link>

            <button
              type="button"
              onClick={() => {
                setUnlocked(false);
                setPinInput('');
              }}
              className="inline-flex items-center gap-1 rounded-2xl bg-[#F2F4F6] px-3 py-2 text-xs font-bold text-[#4E5968] hover:bg-[#E5E8EB]"
            >
              <Lock className="h-3.5 w-3.5" />
              화면 잠금
            </button>
          </div>
        </header>

        {/* ==================================================================
            정산 결과 내보내기 & 기록 정리 툴바 (정산 텍스트 복사 / 내 폰으로 QR / 엑셀 / 초기화)
        ================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[26px] bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. 정산 텍스트 복사 (기존: 카톡용 정산 텍스트 복사 -> 정산 텍스트 복사) */}
            <button
              type="button"
              onClick={handleCopyKakaoText}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold shadow-xs transition active:scale-95 ${
                copiedKakao
                  ? 'bg-[#00C471] text-white'
                  : 'bg-[#3182F6] text-white hover:bg-[#1B64DA]'
              }`}
            >
              {copiedKakao ? (
                <>
                  <Check className="h-4 w-4" />
                  정산 텍스트 복사 완료!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  정산 텍스트 복사
                </>
              )}
            </button>

            {/* 2. 내 폰으로 정산 결과 가져오기 (QR) */}
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#191F28] px-4 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#333D4B] active:scale-95"
            >
              <QrCode className="h-4 w-4 text-[#64A8FF]" />
              내 폰으로 정산 결과 가져오기 (QR)
            </button>

            {/* 3. 엑셀(CSV) 다운로드 (UTF-8 BOM) */}
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#E8FAF0] px-3.5 py-2.5 text-xs font-extrabold text-[#00A859] transition hover:bg-[#D1F5E1] active:scale-95"
            >
              <Download className="h-4 w-4" />
              엑셀(CSV) 다운로드
            </button>
          </div>

          {/* 4. 이전 주문 기록 비우기(초기화) */}
          <button
            type="button"
            onClick={() => {
              setConfirmPinInput('');
              setConfirmPinError(false);
              setClearModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[#FFEEEE] px-3.5 py-2.5 text-xs font-extrabold text-[#F04452] transition hover:bg-[#FFD9DC]"
          >
            <Trash2 className="h-4 w-4" />
            이전 주문 기록 비우기
          </button>
        </div>

        {/* 핵심 KPI 카드 4개 (Toss 스타일 부드러운 카드 톤) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[26px] bg-[#3182F6] p-6 text-white shadow-[0_8px_24px_rgba(49,130,246,0.25)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/80">
                오늘 총 매출액 (완료 기준)
              </span>
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <p className="mt-3 text-3xl font-black text-white">
              {formatCurrency(totalSalesAmount)}
            </p>
            <p className="mt-2 text-xs font-medium text-white/80">
              완료 주문 <strong className="text-white">{completedOrders.length}건</strong> · 총{' '}
              <strong className="text-white">{totalSoldCups}잔/개</strong> 판매
            </p>
          </div>

          <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#3182F6]">
                계좌이체 합계
              </span>
              <CreditCard className="h-5 w-5 text-[#3182F6]" />
            </div>
            <p className="mt-3 text-2xl font-black text-[#191F28]">
              {formatCurrency(transferSalesAmount)}
            </p>
            <p className="mt-2 text-xs font-semibold text-[#8B95A1]">
              완료 {transferOrders.length}건 ({transferRatio}%)
            </p>
          </div>

          <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#00A859]">
                현금 결제 합계
              </span>
              <Banknote className="h-5 w-5 text-[#00A859]" />
            </div>
            <p className="mt-3 text-2xl font-black text-[#191F28]">
              {formatCurrency(cashSalesAmount)}
            </p>
            <p className="mt-2 text-xs font-semibold text-[#8B95A1]">
              완료 {cashOrders.length}건 ({cashRatio}%)
            </p>
          </div>

          <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#F04452]">
                주문 취소 / 대기 현황
              </span>
              <XCircle className="h-5 w-5 text-[#F04452]" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#F04452]">
                취소 {cancelledOrders.length}건
              </span>
              <span className="text-xs font-bold text-[#8B95A1]">
                ({formatCurrency(
                  cancelledOrders.reduce((s, o) => s + o.total_amount, 0)
                )}{' '}
                제외됨)
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#3182F6]">
              <Clock className="h-3.5 w-3.5" />
              현재 제조/픽업 대기: {activeOrders.length}건
            </p>
          </div>
        </div>

        {/* 메뉴별 판매 수량 집계 & 오늘 주문 처리 내역 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)] lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-[#191F28]">
                  메뉴별 판매 수량 집계
                </h2>
                <p className="text-xs font-semibold text-[#8B95A1]">
                  전달 및 결제 완료된 주문 기준 메뉴별 판매량 순위입니다.
                </p>
              </div>
              <span className="rounded-full bg-[#F2F4F6] px-3 py-1 text-xs font-extrabold text-[#4E5968]">
                총 {totalSoldCups}잔/개
              </span>
            </div>

            {menuSalesList.length === 0 ? (
              <div className="py-12 text-center text-sm font-semibold text-[#8B95A1]">
                아직 오늘 전달 완료된 판매 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#F2F4F6] text-xs font-extrabold text-[#8B95A1]">
                      <th className="pb-3">순위 / 메뉴명</th>
                      <th className="pb-3 text-center text-[#3182F6]">ICE</th>
                      <th className="pb-3 text-center text-[#F04452]">HOT</th>
                      <th className="pb-3 text-center">기타</th>
                      <th className="pb-3 text-right">총 수량</th>
                      <th className="pb-3 text-right">판매 금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F4F6]">
                    {menuSalesList.map((stat, idx) => (
                      <tr key={stat.menuName} className="hover:bg-[#F9FAFB]">
                        <td className="py-3 font-extrabold text-[#191F28]">
                          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E8F3FF] text-[11px] font-black text-[#3182F6]">
                            {idx + 1}
                          </span>
                          {stat.menuName}
                        </td>
                        <td className="py-3 text-center font-bold text-[#3182F6]">
                          {stat.iceQty > 0 ? `${stat.iceQty}` : '-'}
                        </td>
                        <td className="py-3 text-center font-bold text-[#F04452]">
                          {stat.hotQty > 0 ? `${stat.hotQty}` : '-'}
                        </td>
                        <td className="py-3 text-center text-[#8B95A1]">
                          {stat.noneQty > 0 ? `${stat.noneQty}` : '-'}
                        </td>
                        <td className="py-3 text-right font-black text-[#191F28]">
                          {stat.totalQty}개
                        </td>
                        <td className="py-3 text-right font-bold text-[#4E5968]">
                          {formatCurrency(stat.totalRevenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)] lg:col-span-5">
            <h2 className="mb-1 text-base font-black text-[#191F28]">
              오늘 주문 처리 내역 ({orders.length}건)
            </h2>
            <p className="mb-4 text-xs font-semibold text-[#8B95A1]">
              취소된 주문은 취소선으로 표시되며 매출 집계에서 자동 제외됩니다.
            </p>

            <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
              {orders.length === 0 ? (
                <div className="py-12 text-center text-xs font-semibold text-[#8B95A1]">
                  기록된 주문 내역이 없습니다.
                </div>
              ) : (
                orders
                  .slice()
                  .reverse()
                  .map((order) => (
                    <div
                      key={order.id}
                      className={`rounded-2xl border p-3.5 text-xs transition ${
                        order.status === 'cancelled'
                          ? 'border-[#FFEEEE] bg-[#FFF8F8] opacity-70'
                          : order.status === 'completed'
                            ? 'border-transparent bg-[#F9FAFB]'
                            : 'border-[#3182F6]/30 bg-[#F4F8FF]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-[#191F28]">
                            #{order.order_number} {order.customer_name} (
                            {order.phone})
                          </span>
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${
                              order.payment_method === 'transfer'
                                ? 'bg-[#E8F3FF] text-[#3182F6]'
                                : 'bg-[#E8FAF0] text-[#00A859]'
                            }`}
                          >
                            {order.payment_method === 'transfer'
                              ? '계좌'
                              : '현금'}
                          </span>
                        </div>

                        <span
                          className={`font-extrabold ${
                            order.status === 'cancelled'
                              ? 'text-[#F04452] line-through'
                              : 'text-[#191F28]'
                          }`}
                        >
                          {formatCurrency(order.total_amount)}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#8B95A1]">
                        <span className="truncate pr-2 font-medium text-[#4E5968]">
                          {order.items
                            .map(
                              (i) =>
                                `${i.menu_name}${
                                  i.temp_option !== 'NONE'
                                    ? `(${i.temp_option})`
                                    : ''
                                }x${i.quantity}`
                            )
                            .join(', ')}
                        </span>
                        <span
                          className={`shrink-0 rounded-lg px-2 py-0.5 font-extrabold ${
                            order.status === 'completed'
                              ? 'bg-[#E8FAF0] text-[#00A859]'
                              : order.status === 'cancelled'
                                ? 'bg-[#FFEEEE] text-[#F04452]'
                                : 'bg-[#E8F3FF] text-[#3182F6]'
                          }`}
                        >
                          {order.status === 'completed'
                            ? '완료'
                            : order.status === 'cancelled'
                              ? '취소됨'
                              : order.status === 'ready'
                                ? '픽업호출'
                                : order.status === 'preparing'
                                  ? '제조중'
                                  : '접수대기'}
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        <div className="pt-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            초기 홈 화면으로 돌아가기
          </Link>
        </div>
      </div>

      {/* ====================================================================
          모달 1: 내 폰으로 정산 결과 가져오기 (QR 코드 & 카톡 텍스트 미리보기)
      ==================================================================== */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-black">
                  내 스마트폰으로 정산 결과 가져오기
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-12">
              {/* 좌측: QR 코드 */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center md:col-span-6">
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                  봉사자 개인 스마트폰 카메라로 스캔
                </span>

                <div className="my-4 rounded-2xl border-2 border-slate-900 bg-white p-3 shadow-md">
                  <svg
                    viewBox={`-4 -4 ${qrMatrix.length + 8} ${qrMatrix.length + 8}`}
                    className="h-52 w-52"
                    shapeRendering="crispEdges"
                  >
                    <rect
                      x={-4}
                      y={-4}
                      width={qrMatrix.length + 8}
                      height={qrMatrix.length + 8}
                      fill="#ffffff"
                    />
                    {qrMatrix.map((row, rIdx) =>
                      row.map((cell, cIdx) =>
                        cell ? (
                          <rect
                            key={`${rIdx}-${cIdx}`}
                            x={cIdx}
                            y={rIdx}
                            width={1}
                            height={1}
                            fill="#000000"
                          />
                        ) : null
                      )
                    )}
                  </svg>
                </div>

                <p className="font-mono text-[11px] font-bold text-slate-500 break-all">
                  {adminUrl}
                </p>

                <ol className="mt-4 space-y-1.5 text-left text-xs text-slate-600">
                  <li>
                    <strong>1단계</strong>: 개인 스마트폰 카메라로 위 QR코드를 찍어 접속합니다.
                  </li>
                  <li>
                    <strong>2단계</strong>: 관리자 4자리 PIN 번호를 입력해 정산 화면을 엽니다.
                  </li>
                  <li>
                    <strong>3단계</strong>: 내 폰에서{' '}
                    <strong className="text-amber-700">
                      [카톡용 정산 텍스트 복사]
                    </strong>{' '}
                    또는{' '}
                    <strong className="text-emerald-700">
                      [엑셀 다운로드]
                    </strong>
                    를 누르면 개인 카톡방에 바로 공유할 수 있습니다!
                  </li>
                </ol>
              </div>

              {/* 우측: 카톡용 정산 텍스트 미리보기 및 즉시 복사 */}
              <div className="flex flex-col justify-between md:col-span-6">
                <div>
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                    <MessageSquareShare className="h-4 w-4 text-amber-600" />
                    카톡 전송용 정산 메시지 미리보기
                  </span>
                  <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-900 p-4 font-sans text-xs leading-relaxed text-slate-100">
                    {kakaoSummaryText}
                  </pre>
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={handleCopyKakaoText}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black shadow-md transition ${
                      copiedKakao
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                    }`}
                  >
                    {copiedKakao ? (
                      <>
                        <Check className="h-4 w-4" />
                        클립보드에 복사되었습니다!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        이 정산 텍스트 복사하기
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-4 w-4 text-emerald-600" />
                    엑셀(CSV) 파일 바로 다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          모달 2: 이전 주문 기록 비우기(초기화) - 관리자 PIN 재확인 팝업
      ==================================================================== */}
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-6 py-4">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="text-base font-black">
                  주문 기록 비우기 (관리자 확인)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className="rounded-lg p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmClearOrders} className="space-y-4 p-6">
              <p className="text-xs leading-relaxed text-slate-600">
                테스트 주문이나 정산이 끝난 이전 주문 기록을 정리합니다.
                <br />
                <strong className="text-rose-600">
                  정리하기 전에 필요시 [카톡 텍스트 복사]나 [엑셀 다운로드]를 먼저 진행해 주세요.
                </strong>
              </p>

              {/* 정리 범위 선택 */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-700">
                  정리할 대상 선택
                </label>
                <button
                  type="button"
                  onClick={() => setClearMode('completed_cancelled')}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-3.5 text-left text-xs font-bold transition ${
                    clearMode === 'completed_cancelled'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span>완료 및 취소된 기록만 비우기 (권장)</span>
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-slate-950">
                    {completedOrders.length + cancelledOrders.length}건
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setClearMode('all')}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-3.5 text-left text-xs font-bold transition ${
                    clearMode === 'all'
                      ? 'border-rose-600 bg-rose-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span>대기 중인 주문 포함 전체 초기화</span>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">
                    전체 {orders.length}건
                  </span>
                </button>
              </div>

              {/* 관리자 4자리 PIN 재확인 */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700">
                  실수 방지를 위해 관리자 PIN 4자리를 입력해 주세요
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={confirmPinInput}
                  onChange={(e) => {
                    setConfirmPinError(false);
                    setConfirmPinInput(
                      e.target.value.replace(/\D/g, '').slice(0, 4)
                    );
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-center font-mono text-xl font-black tracking-[0.5em] text-slate-900 focus:border-rose-600 focus:bg-white focus:outline-none"
                />
                {confirmPinError && (
                  <p className="mt-1.5 text-center text-xs font-bold text-rose-600">
                    관리자 PIN 번호가 일치하지 않습니다.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClearModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={clearing || confirmPinInput.length !== 4}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white shadow-sm hover:bg-rose-700 disabled:bg-slate-300"
                >
                  {clearing ? '정리 중...' : '확인 및 기록 비우기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
