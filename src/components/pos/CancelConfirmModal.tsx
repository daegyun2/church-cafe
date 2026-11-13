'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/lib/config';
import { Order } from '@/types/cafe';
import { AlertTriangle, X } from 'lucide-react';

interface CancelConfirmModalProps {
  order: Order;
  onClose: () => void;
  onConfirmCancel: (orderId: string) => Promise<void>;
}

export default function CancelConfirmModal({
  order,
  onClose,
  onConfirmCancel,
}: CancelConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirmCancel(order.id);
      onClose();
    } catch (err) {
      console.error(err);
      alert('주문 취소 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-6 py-4">
          <div className="flex items-center gap-2.5 text-rose-700">
            <AlertTriangle className="h-6 w-6 shrink-0" />
            <h3 className="text-lg font-extrabold">주문 취소 확인</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-slate-700">
            아래 주문을 정말 <strong className="font-bold text-rose-600">취소 처리</strong>하시겠습니까?
            <br />
            <span className="text-xs text-slate-500">
              * 취소된 주문은 대기열에서 제거되며 당일 매출 합계에서 제외됩니다.
            </span>
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <span className="font-extrabold text-slate-900">
                #{order.order_number} {order.customer_name} ({order.phone})
              </span>
              <span className="text-sm font-bold text-rose-600">
                {formatCurrency(order.total_amount)}
              </span>
            </div>
            <ul className="mt-2.5 space-y-1 text-xs text-slate-600">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>
                    {item.menu_name}{' '}
                    {item.temp_option !== 'NONE' && `(${item.temp_option})`}
                  </span>
                  <span className="font-semibold">x {item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            돌아가기
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-rose-700 disabled:bg-rose-300"
          >
            {loading ? '취소 처리 중...' : '네, 주문을 취소합니다'}
          </button>
        </div>
      </div>
    </div>
  );
}
