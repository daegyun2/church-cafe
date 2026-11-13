'use client';

import React, { useState } from 'react';
import {
  formatCurrency,
  formatPhoneNumber,
  isValidPhoneNumber,
} from '@/lib/config';
import { MenuItem, Order, PaymentMethod, TempOption } from '@/types/cafe';
import { Flame, Minus, Plus, Snowflake, Trash2, X, PlusCircle } from 'lucide-react';

interface EditableItem {
  key: string;
  menu_id: string | null;
  menu_name: string;
  temp_option: TempOption;
  quantity: number;
  unit_price: number;
  has_temp_option: boolean;
}

interface OrderEditModalProps {
  order: Order;
  menus: MenuItem[];
  onClose: () => void;
  onSave: (
    orderId: string,
    updates: {
      payment_method: PaymentMethod;
      customer_name: string;
      phone: string;
      items: {
        menu_id: string | null;
        menu_name: string;
        temp_option: TempOption;
        quantity: number;
        unit_price: number;
      }[];
    }
  ) => Promise<void>;
}

export default function OrderEditModal({
  order,
  menus,
  onClose,
  onSave,
}: OrderEditModalProps) {
  const [customerName, setCustomerName] = useState(order.customer_name);
  const [phone, setPhone] = useState(order.phone);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(order.payment_method);
  const [items, setItems] = useState<EditableItem[]>(() =>
    order.items.map((item, idx) => {
      const matchedMenu = menus.find(
        (m) => m.id === item.menu_id || m.name === item.menu_name
      );
      return {
        key: `${item.id || idx}-${Date.now()}`,
        menu_id: item.menu_id,
        menu_name: item.menu_name,
        temp_option: item.temp_option,
        quantity: item.quantity,
        unit_price: item.unit_price,
        has_temp_option: matchedMenu ? matchedMenu.has_temp_option : item.temp_option !== 'NONE',
      };
    })
  );

  const [selectedAddMenuId, setSelectedAddMenuId] = useState<string>('');
  const [selectedAddTemp, setSelectedAddTemp] = useState<TempOption>('ICE');
  const [saving, setSaving] = useState(false);

  const availableMenus = menus.filter((m) => m.is_visible && !m.is_sold_out);

  const totalAmount = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  const handleQuantityChange = (key: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) =>
          item.key === key
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleToggleTemp = (key: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key || !item.has_temp_option) return item;
        const nextTemp: TempOption = item.temp_option === 'ICE' ? 'HOT' : 'ICE';
        return { ...item, temp_option: nextTemp };
      })
    );
  };

  const handleSelectMenuChange = (menuId: string) => {
    setSelectedAddMenuId(menuId);
    const found = menus.find((m) => m.id === menuId);
    if (found) {
      setSelectedAddTemp(found.has_temp_option ? found.default_temp : 'NONE');
    }
  };

  const handleAddNewItem = () => {
    const found = menus.find((m) => m.id === selectedAddMenuId);
    if (!found) return;

    const targetTemp: TempOption = found.has_temp_option ? selectedAddTemp : 'NONE';

    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.menu_id === found.id && i.temp_option === targetTemp
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }
      return [
        ...prev,
        {
          key: `added-${found.id}-${targetTemp}-${Date.now()}`,
          menu_id: found.id,
          menu_name: found.name,
          temp_option: targetTemp,
          quantity: 1,
          unit_price: found.price,
          has_temp_option: found.has_temp_option,
        },
      ];
    });
  };

  const handleSave = async () => {
    if (items.length === 0) {
      alert('최소 1개 이상의 메뉴가 있어야 합니다. 주문을 취소하려면 [취소] 버튼을 이용해 주세요.');
      return;
    }
    if (!customerName.trim() || !isValidPhoneNumber(phone)) {
      alert('주문자 이름과 휴대폰 번호 전체(010-XXXX-XXXX)를 정확히 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      await onSave(order.id, {
        payment_method: paymentMethod,
        customer_name: customerName.trim(),
        phone: formatPhoneNumber(phone),
        items: items.map((item) => ({
          menu_id: item.menu_id,
          menu_name: item.menu_name,
          temp_option: item.temp_option,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('주문 수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const selectedMenuObj = menus.find((m) => m.id === selectedAddMenuId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div>
            <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold text-slate-950">
              주문번호 #{order.order_number}
            </span>
            <h2 className="mt-1 text-lg font-bold">
              주문 내역 수정 ({order.customer_name} / {order.phone})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* 주문자 & 결제방식 수정 */}
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600">주문자 이름</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:border-amber-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">휴대폰 번호</label>
              <input
                type="tel"
                maxLength={13}
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold tracking-wider focus:border-amber-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">결제 수단</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`rounded-lg py-2 text-xs font-bold transition ${
                    paymentMethod === 'transfer'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'border border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  계좌이체
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`rounded-lg py-2 text-xs font-bold transition ${
                    paymentMethod === 'cash'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'border border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  현금결제
                </button>
              </div>
            </div>
          </div>

          {/* 현재 품목 리스트 */}
          <div>
            <h3 className="mb-2.5 text-sm font-bold text-slate-800">
              주문 품목 ({items.reduce((s, i) => s + i.quantity, 0)}잔/개)
            </h3>
            <div className="space-y-2.5">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-900">{item.menu_name}</span>
                    {item.temp_option !== 'NONE' && (
                      <button
                        type="button"
                        onClick={() => handleToggleTemp(item.key)}
                        disabled={!item.has_temp_option}
                        title={item.has_temp_option ? '클릭하여 HOT/ICE 전환' : '단일 온도 메뉴'}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                          item.temp_option === 'HOT'
                            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                            : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                        } ${item.has_temp_option ? 'cursor-pointer ring-1 ring-current/30' : 'cursor-default opacity-80'}`}
                      >
                        {item.temp_option === 'HOT' ? (
                          <Flame className="h-3.5 w-3.5" />
                        ) : (
                          <Snowflake className="h-3.5 w-3.5" />
                        )}
                        {item.temp_option}
                        {item.has_temp_option && (
                          <span className="ml-0.5 text-[10px] underline">변경</span>
                        )}
                      </button>
                    )}
                    <span className="text-xs text-slate-500">
                      단가 {formatCurrency(item.unit_price)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.key, -1)}
                        className="p-2 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-extrabold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.key, 1)}
                        className="p-2 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <span className="w-20 text-right text-sm font-bold text-slate-900">
                      {formatCurrency(item.unit_price * item.quantity)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.key, -item.quantity)}
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                      title="품목 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 새 메뉴 추가 영역 */}
          <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50/50 p-4">
            <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <PlusCircle className="h-4 w-4 text-amber-600" />
              새 메뉴 추가하기
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedAddMenuId}
                onChange={(e) => handleSelectMenuChange(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-amber-600 focus:outline-none"
              >
                <option value="">+ 추가할 메뉴 선택...</option>
                {availableMenus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatCurrency(m.price)})
                  </option>
                ))}
              </select>

              {selectedMenuObj && selectedMenuObj.has_temp_option && (
                <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setSelectedAddTemp('ICE')}
                    className={`flex items-center gap-1 px-3 py-2 text-xs font-bold ${
                      selectedAddTemp === 'ICE'
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Snowflake className="h-3.5 w-3.5" /> ICE
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAddTemp('HOT')}
                    className={`flex items-center gap-1 px-3 py-2 text-xs font-bold ${
                      selectedAddTemp === 'HOT'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Flame className="h-3.5 w-3.5" /> HOT
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedAddMenuId}
                onClick={handleAddNewItem}
                className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                품목 추가
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <span className="text-xs font-medium text-slate-500">재계산된 총 결제 금액</span>
            <p className="text-2xl font-black text-amber-600">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              닫기
            </button>
            <button
              type="button"
              disabled={saving || items.length === 0}
              onClick={handleSave}
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-slate-800 disabled:bg-slate-400"
            >
              {saving ? '저장 중...' : '수정 완료 및 금액 반영'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
