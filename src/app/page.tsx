'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_CAFE_SETTINGS } from '@/lib/config';
import { fetchCafeSettings, subscribeCafeRealtime } from '@/lib/store';
import { isSupabaseConfigured } from '@/lib/supabase';
import { CafeSettings } from '@/types/cafe';
import {
  BarChart3,
  Coffee,
  Database,
  MonitorSmartphone,
  QrCode,
  Sparkles,
  Wifi,
} from 'lucide-react';

export default function HomePage() {
  const [cafeSettings, setCafeSettings] = useState<CafeSettings>(
    DEFAULT_CAFE_SETTINGS
  );

  useEffect(() => {
    fetchCafeSettings().then(setCafeSettings);
    const unsub = subscribeCafeRealtime(() => {
      fetchCafeSettings().then(setCafeSettings);
    });
    return () => unsub();
  }, []);

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F2F4F6] p-6 md:p-12">
      <div className="mx-auto w-full max-w-5xl">
        {/* 상단 상태 배너 */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-white px-6 py-4 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8F3FF] text-[#3182F6]">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-[#191F28]">
                {cafeSettings.cafe_name} 주문 & POS 시스템
              </h1>
              <p className="text-xs font-medium text-[#8B95A1]">
                모바일 QR 주문 · 카운터 태블릿 POS · 일일 정산 통합 시스템
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSupabaseConfigured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700">
                <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                실시간 주문 연결됨
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F2F4F6] px-3.5 py-1.5 text-xs font-bold text-[#4E5968]">
                <Database className="h-3.5 w-3.5 text-[#8B95A1]" />
                기기 내부 테스트 모드
              </span>
            )}
          </div>
        </div>

        {/* 3개 핵심 화면 진입 카드 */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* 1. 손님 QR 주문 */}
          <Link
            href="/order"
            className="group flex flex-col justify-between rounded-[28px] bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]"
          >
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F3FF] text-[#3182F6] transition group-hover:bg-[#3182F6] group-hover:text-white">
                <QrCode className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-[#E8F3FF] px-3 py-1 text-xs font-bold text-[#3182F6]">
                스마트폰 세로 화면 최적화
              </span>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#191F28]">
                손님 QR 주문
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
                메뉴 및 Hot/Ice 옵션 선택 후 이름 + 뒷자리 4자리 + 결제수단(계좌이체/현금)을 입력해 주문합니다. 완료 화면에서 계좌번호 원클릭 복사를 지원합니다.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-[#F2F4F6] pt-4 text-sm font-bold text-[#3182F6]">
              <span>/order 접속하기</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* 2. 카운터 태블릿 POS */}
          <Link
            href="/pos"
            className="group flex flex-col justify-between rounded-[28px] bg-[#3182F6] p-7 text-white shadow-[0_8px_24px_rgba(49,130,246,0.28)] transition hover:-translate-y-1 hover:bg-[#1B64DA]"
          >
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-white">
                <MonitorSmartphone className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white">
                태블릿 가로 화면 최적화
              </span>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
                카운터 통합 POS
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/85">
                좌측에서 카운터 직접 주문을 입력하고, 우측 실시간 대기열에서 음료 제조·일괄 선택·주문 수정·취소·전달완료 및 품절 관리를 한 화면에서 처리합니다.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-white/20 pt-4 text-sm font-bold text-white">
              <span>/pos 실행하기</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* 3. 일일 정산 대시보드 */}
          <Link
            href="/admin"
            className="group flex flex-col justify-between rounded-[28px] bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.04)] transition hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]"
          >
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F2F4F6] text-[#191F28] transition group-hover:bg-[#191F28] group-hover:text-white">
                <BarChart3 className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-[#F2F4F6] px-3 py-1 text-xs font-bold text-[#4E5968]">
                4자리 PIN 보안 잠금 (기본 1234)
              </span>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#191F28]">
                일일 정산 및 통계
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#4E5968]">
                오늘 전달 완료된 주문 기준 총 매출액, 계좌이체 vs 현금 결제수단별 합계, 메뉴별 판매 수량 순위 및 스마트폰 QR 정산 리포트를 확인합니다.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-[#F2F4F6] pt-4 text-sm font-bold text-[#191F28]">
              <span>/admin 정산 보기</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>
        </div>

        {/* 빠른 테스트 팁 */}
        <div className="mt-6 rounded-[24px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#191F28]">
            <Sparkles className="h-4 w-4 text-[#3182F6]" />
            실시간 연동 안내
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-[#4E5968]">
            브라우저 창 2개를 나란히 띄워 한쪽에는 <strong>/order (손님 스마트폰 화면)</strong>, 다른 쪽에는 <strong>/pos (카운터 태블릿 화면)</strong>를 열어보세요. 손님 화면에서 주문을 넣거나 POS에서 품절 스위치를 토글하면 새로고침 없이 즉시 반영됩니다.
          </p>
        </div>
      </div>

      <footer className="mt-12 text-center text-xs font-medium text-[#8B95A1]">
        Church Mission Cafe Web Order & POS • Next.js + Supabase Realtime
      </footer>
    </div>
  );
}
