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
    <div className="flex min-h-screen flex-col justify-between bg-gradient-to-b from-amber-50/70 via-white to-slate-50 p-6 md:p-12">
      <div className="mx-auto w-full max-w-5xl">
        {/* 상단 상태 배너 */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200/80 bg-white/90 px-5 py-3.5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
              <Coffee className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                {cafeSettings.cafe_name} 주문 & POS 시스템
              </h1>
              <p className="text-xs text-slate-500">
                선(先) 제조 · 픽업 시 결제/입금 확인 프로세스 최적화 MVP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSupabaseConfigured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-xs font-extrabold text-emerald-800">
                <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                Supabase Realtime 연동됨
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3.5 py-1.5 text-xs font-extrabold text-amber-900">
                <Database className="h-3.5 w-3.5 text-amber-600" />
                로컬 실시간 데모 모드 (브라우저 탭 간 자동 동기화)
              </span>
            )}
          </div>
        </div>

        {/* 3개 핵심 화면 진입 카드 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* 1. 손님 QR 주문 */}
          <Link
            href="/order"
            className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-amber-500 hover:shadow-xl"
          >
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 transition group-hover:bg-amber-600 group-hover:text-white">
                <QrCode className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                스마트폰 세로 화면 최적화
              </span>
              <h2 className="mt-3 text-2xl font-black text-slate-900">
                손님 QR 주문
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                메뉴 및 Hot/Ice 옵션 선택 후 이름 + 뒷자리 4자리 + 결제수단(계좌이체/현금)을 입력해 주문합니다. 완료 화면에서 계좌번호 원클릭 복사를 지원합니다.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-extrabold text-amber-600">
              <span>/order 접속하기</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* 2. 카운터 태블릿 POS */}
          <Link
            href="/pos"
            className="group flex flex-col justify-between rounded-3xl border-2 border-slate-900 bg-slate-900 p-7 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
          >
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-slate-950">
                <MonitorSmartphone className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-amber-400">
                태블릿 가로 화면 최적화
              </span>
              <h2 className="mt-3 text-2xl font-black text-white">
                카운터 통합 POS
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                좌측에서 카운터 직접 주문을 입력하고, 우측 실시간 대기열에서 음료 제조·주문 수정·취소·전달완료 및 품절/신메뉴 관리를 한 화면에서 처리합니다.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-sm font-extrabold text-amber-400">
              <span>/pos 실행하기</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* 3. 일일 정산 대시보드 */}
          <Link
            href="/admin"
            className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
          >
            <div>
              <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white">
                <BarChart3 className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                4자리 PIN 보안 잠금 (기본 1234)
              </span>
              <h2 className="mt-3 text-2xl font-black text-slate-900">
                일일 정산 및 통계
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                오늘 전달 완료된 주문 기준 총 매출액, 계좌이체 vs 현금 결제수단별 합계, 메뉴별 판매 수량 순위 및 취소 건수를 한눈에 확인합니다.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-extrabold text-emerald-600">
              <span>/admin 정산 보기</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>
        </div>

        {/* 빠른 테스트 팁 */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Sparkles className="h-4 w-4 text-amber-500" />
            로컬 실시간 연동 테스트 방법
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            브라우저 창 2개를 나란히 띄워 한쪽에는 <strong>/order (손님 스마트폰 화면)</strong>, 다른 쪽에는 <strong>/pos (카운터 태블릿 화면)</strong>를 열어보세요. 손님 화면에서 주문을 넣거나 POS에서 품절 스위치를 토글하면 새로고침 없이 즉시 반영됩니다.
          </p>
        </div>
      </div>

      <footer className="mt-12 text-center text-xs text-slate-400">
        Church Mission Cafe Web Order & POS MVP • Next.js + Supabase Realtime
      </footer>
    </div>
  );
}
