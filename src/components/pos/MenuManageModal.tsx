'use client';

import React, { useState } from 'react';
import {
  DEFAULT_CAFE_SETTINGS,
  DEFAULT_CATEGORIES,
  formatCurrency,
  getCategoryLabel,
} from '@/lib/config';
import {
  CafeSettings,
  CategoryItem,
  CreateMenuInput,
  MenuCategory,
  MenuItem,
  TempOption,
} from '@/types/cafe';
import {
  Building2,
  Check,
  Coffee,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  PlusCircle,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface MenuManageModalProps {
  initialTab?: 'menus' | 'settings';
  menus: MenuItem[];
  cafeSettings: CafeSettings;
  onClose: () => void;
  onToggleSoldOut: (menuId: string, isSoldOut: boolean) => Promise<void>;
  onCreateMenu: (input: CreateMenuInput) => Promise<void>;
  onUpdateMenu: (
    menuId: string,
    updates: Partial<Omit<MenuItem, 'id' | 'created_at'>>
  ) => Promise<void>;
  onDeleteMenu: (menuId: string) => Promise<void>;
  onUpdateSettings: (settings: CafeSettings) => Promise<void>;
}

export default function MenuManageModal({
  initialTab = 'menus',
  menus,
  cafeSettings,
  onClose,
  onToggleSoldOut,
  onCreateMenu,
  onUpdateMenu,
  onDeleteMenu,
  onUpdateSettings,
}: MenuManageModalProps) {
  const [activeTab, setActiveTab] = useState<'menus' | 'settings'>(initialTab);

  const categories: CategoryItem[] =
    cafeSettings.categories && cafeSettings.categories.length > 0
      ? cafeSettings.categories
      : DEFAULT_CATEGORIES;

  // 카테고리 추가/삭제/이름변경/숨김 관리 패널 상태
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renamingCatText, setRenamingCatText] = useState('');

  // 메뉴 관리 폼 상태
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MenuCategory>(
    categories[0]?.id || 'coffee'
  );
  const [price, setPrice] = useState('2500');
  const [hasTempOption, setHasTempOption] = useState(true);
  const [defaultTemp, setDefaultTemp] = useState<TempOption>('ICE');
  const [isNew, setIsNew] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [submittingMenu, setSubmittingMenu] = useState(false);
  const [filterCat, setFilterCat] = useState<MenuCategory | 'all'>('all');

  // 카페 기본 설정 폼 상태
  const [cafeName, setCafeName] = useState(cafeSettings.cafe_name);
  const [bankName, setBankName] = useState(cafeSettings.bank_name);
  const [accountNumber, setAccountNumber] = useState(
    cafeSettings.account_number
  );
  const [accountHolder, setAccountHolder] = useState(
    cafeSettings.account_holder
  );
  const [isQrOrderEnabled, setIsQrOrderEnabled] = useState(
    cafeSettings.is_qr_order_enabled !== false
  );
  const [qrPauseMessage, setQrPauseMessage] = useState(
    cafeSettings.qr_pause_message || DEFAULT_CAFE_SETTINGS.qr_pause_message || ''
  );
  const [allowTransfer, setAllowTransfer] = useState(
    cafeSettings.allow_transfer !== false
  );
  const [allowCash, setAllowCash] = useState(cafeSettings.allow_cash !== false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // 비밀번호(PIN) 보안 변경 전용 상태 (현재 PIN 확인 -> 새 PIN -> 새 PIN 재확인)
  const [isPinChangeOpen, setIsPinChangeOpen] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const resetMenuForm = () => {
    setEditingMenuId(null);
    setName('');
    setCategory(categories[0]?.id || 'coffee');
    setPrice('2500');
    setHasTempOption(true);
    setDefaultTemp('ICE');
    setIsNew(true);
    setIsVisible(true);
  };

  const handleStartEdit = (menu: MenuItem) => {
    setEditingMenuId(menu.id);
    setName(menu.name);
    setCategory(menu.category);
    setPrice(String(menu.price));
    setHasTempOption(menu.has_temp_option);
    setDefaultTemp(menu.default_temp);
    setIsNew(menu.is_new);
    setIsVisible(menu.is_visible);
  };

  // 카테고리 추가 핸들러
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name === trimmed)) {
      alert('이미 동일한 이름의 카테고리가 있습니다.');
      return;
    }

    const newCat: CategoryItem = {
      id: `cat-${Date.now()}`,
      name: trimmed,
      is_visible: true,
    };
    const nextCategories = [...categories, newCat];
    await onUpdateSettings({
      ...cafeSettings,
      categories: nextCategories,
    });
    setNewCategoryName('');
    setCategory(newCat.id);
  };

  // 카테고리 일시 숨김 / 노출 토글 핸들러 (삭제하지 않고 그 안의 메뉴들과 함께 잠깐 숨겨두기)
  const handleToggleCategoryVisible = async (cat: CategoryItem) => {
    const nextVisible = cat.is_visible === false ? true : false;
    const visibleCount = categories.filter(
      (c) => (c.id === cat.id ? nextVisible : c.is_visible !== false)
    ).length;

    if (visibleCount === 0) {
      alert('최소 1개 이상의 카테고리는 노출 상태여야 합니다.');
      return;
    }

    const nextCategories = categories.map((c) =>
      c.id === cat.id ? { ...c, is_visible: nextVisible } : c
    );
    await onUpdateSettings({
      ...cafeSettings,
      categories: nextCategories,
    });
  };

  // 카테고리 이름 변경 저장 핸들러
  const handleSaveRenameCategory = async (catId: string) => {
    const trimmed = renamingCatText.trim();
    if (!trimmed) return;
    const nextCategories = categories.map((c) =>
      c.id === catId ? { ...c, name: trimmed } : c
    );
    await onUpdateSettings({
      ...cafeSettings,
      categories: nextCategories,
    });
    setRenamingCatId(null);
    setRenamingCatText('');
  };

  // 카테고리 삭제 핸들러
  const handleDeleteCategory = async (cat: CategoryItem) => {
    if (categories.length <= 1) {
      alert('최소 1개 이상의 카테고리가 있어야 합니다.');
      return;
    }

    const affectedMenus = menus.filter((m) => m.category === cat.id);
    const fallbackCat = categories.find((c) => c.id !== cat.id)!;

    const confirmMsg =
      affectedMenus.length > 0
        ? `'${cat.name}' 카테고리를 완전히 삭제하시겠습니까?\n(잠깐 안 보이게 하려면 삭제 대신 '눈 아이콘(숨김)'을 누르시는 것을 권장합니다.\n삭제 시 속해 있던 ${affectedMenus.length}개 메뉴는 '${fallbackCat.name}' 카테고리로 이동됩니다.)`
        : `'${cat.name}' 카테고리를 삭제하시겠습니까?`;

    if (!confirm(confirmMsg)) return;

    for (const m of affectedMenus) {
      await onUpdateMenu(m.id, { category: fallbackCat.id });
    }

    const nextCategories = categories.filter((c) => c.id !== cat.id);
    await onUpdateSettings({
      ...cafeSettings,
      categories: nextCategories,
    });

    if (filterCat === cat.id) setFilterCat('all');
    if (category === cat.id) setCategory(fallbackCat.id);
  };

  const handleMenuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericPrice = parseInt(price, 10);
    if (!name.trim() || isNaN(numericPrice) || numericPrice < 0) {
      alert('메뉴명과 올바른 가격을 입력해 주세요.');
      return;
    }

    setSubmittingMenu(true);
    try {
      if (editingMenuId) {
        await onUpdateMenu(editingMenuId, {
          name: name.trim(),
          category,
          price: numericPrice,
          has_temp_option: hasTempOption,
          default_temp: defaultTemp,
          is_new: isNew,
          is_visible: isVisible,
        });
      } else {
        await onCreateMenu({
          name: name.trim(),
          category,
          price: numericPrice,
          has_temp_option: hasTempOption,
          default_temp: defaultTemp,
          is_new: isNew,
          is_visible: isVisible,
          is_sold_out: false,
        });
      }
      resetMenuForm();
    } catch (err) {
      console.error(err);
      alert('메뉴 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmittingMenu(false);
    }
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cafeName.trim()) {
      alert('선교카페 이름을 입력해 주세요.');
      return;
    }
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      alert('입금 은행명, 계좌번호, 예금주를 모두 입력해 주세요.');
      return;
    }
    if (!allowTransfer && !allowCash) {
      alert('계좌이체와 현금결제 중 최소 1개 이상의 결제수단은 켜두어야 합니다.');
      return;
    }

    setSavingSettings(true);
    try {
      await onUpdateSettings({
        cafe_name: cafeName.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim(),
        admin_pin: cafeSettings.admin_pin,
        categories,
        is_qr_order_enabled: isQrOrderEnabled,
        qr_pause_message: qrPauseMessage.trim(),
        allow_transfer: allowTransfer,
        allow_cash: allowCash,
      });
      setSettingsSavedMsg(true);
      setTimeout(() => setSettingsSavedMsg(false), 3000);
    } catch (err) {
      console.error(err);
      alert('카페 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingSettings(false);
    }
  };

  // 비밀번호(PIN) 별도 보안 변경 핸들러
  const handlePinChangeSubmit = async () => {
    setPinChangeError(null);

    if (currentPinInput !== cafeSettings.admin_pin) {
      setPinChangeError('현재 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPinInput.length !== 4) {
      setPinChangeError('새 비밀번호는 숫자 4자리로 입력해 주세요.');
      return;
    }
    if (newPinInput !== confirmNewPinInput) {
      setPinChangeError('새 비밀번호와 확인 입력이 서로 일치하지 않습니다.');
      return;
    }
    if (newPinInput === currentPinInput) {
      setPinChangeError('기존 비밀번호와 다른 새로운 4자리 숫자를 입력해 주세요.');
      return;
    }

    setSavingPin(true);
    try {
      await onUpdateSettings({
        ...cafeSettings,
        cafe_name: cafeName.trim() || cafeSettings.cafe_name,
        bank_name: bankName.trim() || cafeSettings.bank_name,
        account_number: accountNumber.trim() || cafeSettings.account_number,
        account_holder: accountHolder.trim() || cafeSettings.account_holder,
        admin_pin: newPinInput,
      });
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmNewPinInput('');
      setIsPinChangeOpen(false);
      setPinChangeSuccess(true);
      setTimeout(() => setPinChangeSuccess(false), 3500);
    } catch (err) {
      console.error(err);
      setPinChangeError('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setSavingPin(false);
    }
  };

  const hiddenCatIds = new Set(
    categories.filter((c) => c.is_visible === false).map((c) => c.id)
  );

  const filteredMenus =
    filterCat === 'all' ? menus : menus.filter((m) => m.category === filterCat);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* 상단 헤더 & 탭 전환 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('menus')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                activeTab === 'menus'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Coffee className="h-4 w-4" />
              1. 판매 메뉴 · 카테고리 · 품절/숨김 관리
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Building2 className="h-4 w-4" />
              2. 카페정보 · 계좌 · 운영일시중지 · PIN 설정
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* ====================================================================
            탭 1: 판매 메뉴 · 가격 · 품절/숨김 관리 (+ 카테고리 추가/숨김/삭제)
        ==================================================================== */}
        {activeTab === 'menus' ? (
          <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
            {/* 좌측: 카테고리 바 + 메뉴 목록 (7 cols) */}
            <div className="flex flex-col overflow-hidden border-b border-slate-200 lg:col-span-7 lg:border-r lg:border-b-0">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setFilterCat('all')}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        filterCat === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      전체 메뉴
                    </button>
                    {categories.map((cat) => {
                      const isCatHidden = cat.is_visible === false;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setFilterCat(cat.id)}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            filterCat === cat.id
                              ? 'bg-slate-900 text-white'
                              : isCatHidden
                                ? 'border border-dashed border-slate-300 bg-slate-100 text-slate-400'
                                : 'bg-white text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isCatHidden && <EyeOff className="h-3 w-3" />}
                          <span>{cat.name}</span>
                          {isCatHidden && (
                            <span className="text-[10px] font-extrabold">
                              (숨김)
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditingCategories(!isEditingCategories)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition ${
                      isEditingCategories
                        ? 'border-amber-500 bg-amber-500 text-slate-950'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    {isEditingCategories ? '편집 닫기' : '+ 카테고리 편집/숨김'}
                  </button>
                </div>

                {/* 카테고리 추가 / 일시숨김 / 이름변경 / 삭제 패널 */}
                {isEditingCategories && (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3.5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs font-extrabold text-amber-950">
                        카테고리(분류 탭) 추가 · 잠깐 숨겨두기 · 이름 수정 · 삭제
                      </span>
                      <span className="text-[11px] font-semibold text-amber-800">
                        💡 지우지 않고 [노출중/숨김됨]을 누르면 해당 분류와 메뉴가 잠깐 감춰집니다
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      {categories.map((cat) => {
                        const isCatHidden = cat.is_visible === false;
                        return (
                          <div
                            key={cat.id}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 shadow-2xs transition ${
                              isCatHidden
                                ? 'border-dashed border-slate-300 bg-slate-100 opacity-75'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {renamingCatId === cat.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renamingCatText}
                                  onChange={(e) =>
                                    setRenamingCatText(e.target.value)
                                  }
                                  className="w-28 rounded border border-amber-500 px-2 py-0.5 text-xs font-bold text-slate-900 focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveRenameCategory(cat.id)
                                  }
                                  className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white"
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingCatId(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <>
                                <span
                                  className={`text-xs font-extrabold ${
                                    isCatHidden
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  {cat.name}
                                </span>

                                {/* 카테고리 잠깐 숨겨두기 토글 버튼 */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleCategoryVisible(cat)
                                  }
                                  title={
                                    isCatHidden
                                      ? '클릭하여 다시 화면에 노출하기'
                                      : '삭제하지 않고 잠깐 숨겨두기'
                                  }
                                  className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold transition ${
                                    isCatHidden
                                      ? 'bg-slate-700 text-white'
                                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  }`}
                                >
                                  {isCatHidden ? (
                                    <>
                                      <EyeOff className="h-3 w-3" /> 숨김됨
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="h-3 w-3" /> 노출중
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingCatId(cat.id);
                                    setRenamingCatText(cat.name);
                                  }}
                                  title="카테고리 이름 바꾸기"
                                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(cat)}
                                  title="카테고리 영구 삭제"
                                  className="rounded p-0.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={handleAddCategory}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        placeholder="새 카테고리 이름 (예: 시즌 음료, 빙수, 베이커리)"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!newCategoryName.trim()}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-slate-800 disabled:bg-slate-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        카테고리 추가
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* 품절 vs 숨김 안내 도움말 바 */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2 text-[11px] text-slate-500">
                <span>
                  • <strong className="text-rose-600">품절</strong>: 메뉴판에 보이되{' '}
                  <span className="underline">품절 표시</span>로 선택 차단 (당일 재료 소진 시)
                </span>
                <span>
                  • <strong className="text-slate-700">숨김</strong>: 삭제하지 않고{' '}
                  <span className="underline">메뉴판에서 아예 감춤</span> (계절/일시 미판매 시)
                </span>
              </div>

              {/* 메뉴 리스트 */}
              <div className="flex-1 divide-y divide-slate-100 overflow-y-auto p-4">
                {filteredMenus.length === 0 ? (
                  <div className="py-12 text-center text-xs font-semibold text-slate-400">
                    이 카테고리에 등록된 메뉴가 없습니다. 오른쪽에서 메뉴를 추가해 보세요!
                  </div>
                ) : (
                  filteredMenus.map((menu) => {
                    const isCatHidden = hiddenCatIds.has(menu.category);
                    const isEffectivelyHidden = !menu.is_visible || isCatHidden;

                    return (
                      <div
                        key={menu.id}
                        className={`flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition ${
                          editingMenuId === menu.id
                            ? 'bg-amber-50/80 ring-1 ring-amber-400'
                            : isEffectivelyHidden
                              ? 'bg-slate-50/70 opacity-60'
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-extrabold text-slate-900">
                              {menu.name}
                            </span>
                            {menu.is_new && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                                NEW
                              </span>
                            )}
                            {!menu.is_visible && (
                              <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-white">
                                개별 숨김됨
                              </span>
                            )}
                            {isCatHidden && (
                              <span className="rounded-md bg-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                카테고리 숨김됨
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-extrabold text-amber-700">
                              {formatCurrency(menu.price)}
                            </span>
                            <span>•</span>
                            <span>
                              {getCategoryLabel(categories, menu.category)}
                            </span>
                            <span>•</span>
                            <span>
                              {menu.has_temp_option
                                ? 'HOT/ICE 선택 가능'
                                : menu.default_temp === 'NONE'
                                  ? '온도 옵션 없음'
                                  : `${menu.default_temp} 전용`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* 1. 품절 스위치 */}
                          <button
                            type="button"
                            onClick={() =>
                              onToggleSoldOut(menu.id, !menu.is_sold_out)
                            }
                            className={`relative inline-flex h-9 w-20 shrink-0 cursor-pointer items-center justify-center rounded-xl text-xs font-extrabold transition ${
                              menu.is_sold_out
                                ? 'bg-rose-600 text-white shadow-xs hover:bg-rose-700'
                                : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            }`}
                          >
                            {menu.is_sold_out ? '품절해제' : '판매중'}
                          </button>

                          {/* 2. 잠깐 숨겨두기 스위치 */}
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMenu(menu.id, {
                                is_visible: !menu.is_visible,
                              })
                            }
                            title={
                              menu.is_visible
                                ? '삭제하지 않고 메뉴판에서 잠깐 숨겨두기'
                                : '다시 메뉴판에 노출하기'
                            }
                            className={`inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-extrabold transition ${
                              menu.is_visible
                                ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                : 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                            }`}
                          >
                            {menu.is_visible ? (
                              <>
                                <Eye className="h-3.5 w-3.5" />
                                노출
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3.5 w-3.5" />
                                숨김됨
                              </>
                            )}
                          </button>

                          {/* 3. 정보/가격 수정 */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(menu)}
                            title="메뉴 이름 및 가격 수정"
                            className={`inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-extrabold transition ${
                              editingMenuId === menu.id
                                ? 'border-amber-500 bg-amber-500 text-slate-950'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            수정
                          </button>

                          {/* 4. 영구 삭제 */}
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                confirm(
                                  `'${menu.name}' 메뉴를 완전히 삭제하시겠습니까?\n(나중에 다시 쓸 메뉴라면 삭제 대신 옆의 [노출/숨김] 버튼을 사용해보세요!)`
                                )
                              ) {
                                await onDeleteMenu(menu.id);
                                if (editingMenuId === menu.id) resetMenuForm();
                              }
                            }}
                            title="메뉴 영구 삭제"
                            className="rounded-xl border border-slate-200 p-2 text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 우측: 신메뉴 등록 / 기존 메뉴·가격 수정 폼 (5 cols) */}
            <div className="flex flex-col overflow-y-auto bg-slate-50 p-6 lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                  {editingMenuId ? (
                    <>
                      <Edit3 className="h-5 w-5 text-amber-600" />
                      선택한 메뉴 · 가격 수정
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-5 w-5 text-emerald-600" />
                      신메뉴 추가 등록
                    </>
                  )}
                </h3>
                {editingMenuId && (
                  <button
                    type="button"
                    onClick={resetMenuForm}
                    className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-300"
                  >
                    + 신메뉴 추가 모드로 전환
                  </button>
                )}
              </div>

              <form onSubmit={handleMenuSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    메뉴명 *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 아메리카노 / 피치 우롱티"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">
                        카테고리 *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsEditingCategories(true)}
                        className="text-[11px] font-bold text-amber-700 underline hover:text-amber-900"
                      >
                        + 목록 편집/숨김
                      </button>
                    </div>
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as MenuCategory)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}{' '}
                          {cat.is_visible === false ? '(현재 숨김상태)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      판매 가격 (원) *
                    </label>
                    <input
                      type="number"
                      step={100}
                      min={0}
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-extrabold text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[1500, 2000, 2500, 3000, 3500, 4000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPrice(String(preset))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        price === String(preset)
                          ? 'border-amber-500 bg-amber-100 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {formatCurrency(preset)}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      HOT / ICE 양쪽 선택 가능 여부
                    </span>
                    <input
                      type="checkbox"
                      checked={hasTempOption}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasTempOption(checked);
                        if (checked && defaultTemp === 'NONE') {
                          setDefaultTemp('ICE');
                        }
                      }}
                      className="h-4 w-4 accent-slate-900"
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      {hasTempOption
                        ? '기본 선택 온도'
                        : '단일 온도 설정 (아이스 전용 / 핫 전용 / 디저트)'}
                    </label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {(['ICE', 'HOT', 'NONE'] as const).map((temp) => {
                        const disabled = hasTempOption && temp === 'NONE';
                        return (
                          <button
                            key={temp}
                            type="button"
                            disabled={disabled}
                            onClick={() => setDefaultTemp(temp)}
                            className={`rounded-lg py-2 text-xs font-bold transition ${
                              defaultTemp === temp
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 bg-slate-50 text-slate-600'
                            } ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
                          >
                            {temp === 'NONE' ? '옵션없음' : temp}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsNew(!isNew)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition ${
                      isNew
                        ? 'border-amber-500 bg-amber-50 text-amber-900'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    NEW 뱃지 {isNew ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsVisible(!isVisible)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition ${
                      isVisible
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-700 bg-slate-800 text-white'
                    }`}
                  >
                    {isVisible ? (
                      <>
                        <Eye className="h-4 w-4" /> 화면 노출 ON
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4" /> 잠깐 숨겨두기
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submittingMenu}
                  className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-slate-800 disabled:bg-slate-400"
                >
                  {submittingMenu
                    ? '저장 중...'
                    : editingMenuId
                      ? '메뉴 · 가격 수정사항 저장하기'
                      : '신메뉴 등록하기'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* ==================================================================
              탭 2: 카페 기본정보 · 입금계좌 · 운영일시중지/결제숨김 · 정산 PIN 설정
          ================================================================== */
          <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
            <form
              onSubmit={handleSettingsSubmit}
              className="space-y-4 border-b border-slate-200 p-6 lg:col-span-7 lg:border-r lg:border-b-0"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  카페 기본정보 · 계좌 · 일시중지 · 정산 PIN 설정
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  여기서 수정하고 저장하면 손님 스마트폰(/order)과 POS(/pos), 일일 정산(/admin) 화면에 즉시 반영됩니다.
                </p>
              </div>

              {settingsSavedMsg && (
                <div className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-md">
                  <Check className="h-5 w-5" />
                  설정이 저장되어 모든 화면에 실시간으로 반영되었습니다!
                </div>
              )}

              {/* 1. 모바일 QR 주문 잠깐 닫아두기 (예배 시간 / 브레이크 타임) */}
              <div
                className={`rounded-2xl border-2 p-4 transition ${
                  isQrOrderEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-amber-400 bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                      {isQrOrderEnabled ? (
                        <PlayCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <PauseCircle className="h-4 w-4 text-amber-600" />
                      )}
                      손님 모바일 QR 주문 접수 상태 (예배시간/준비중 일시숨김)
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      예배 시작 전이나 재료 준비 중일 때 잠시 QR 주문을 막아둘 수 있습니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsQrOrderEnabled(!isQrOrderEnabled)}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-black shadow-2xs transition ${
                      isQrOrderEnabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    }`}
                  >
                    {isQrOrderEnabled ? '현재: 주문 열림' : '현재: 일시중지됨'}
                  </button>
                </div>

                {!isQrOrderEnabled && (
                  <div className="mt-3">
                    <span className="block text-[11px] font-bold text-amber-900">
                      일시중지 시 손님 화면에 보여줄 안내 문구
                    </span>
                    <input
                      type="text"
                      value={qrPauseMessage}
                      onChange={(e) => setQrPauseMessage(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 2. 선교카페 이름 */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                  <Coffee className="h-4 w-4 text-amber-600" />
                  선교카페 이름 (손님 주문 화면 & POS 상단 표시)
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 첨단겨자씨교회 선교카페"
                  value={cafeName}
                  onChange={(e) => setCafeName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>

              {/* 3. 입금 계좌 정보 & 결제수단 노출 설정 */}
              <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-extrabold text-blue-900">
                    <CreditCard className="h-4 w-4 text-blue-600" />
                    계좌이체 안내 및 결제수단 노출 설정
                  </label>

                  {/* 결제수단 일시 숨기기 토글 */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAllowTransfer(!allowTransfer)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                        allowTransfer
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-300 bg-white text-slate-400 line-through'
                      }`}
                    >
                      계좌이체 {allowTransfer ? 'ON' : '숨김'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllowCash(!allowCash)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                        allowCash
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-300 bg-white text-slate-400 line-through'
                      }`}
                    >
                      현금결제 {allowCash ? 'ON' : '숨김'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-600">
                      은행명 *
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="예: 카카오뱅크 / 농협 / 국민은행"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <span className="block text-[11px] font-bold text-slate-600">
                      예금주명 *
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="예: 첨단겨자씨교회 선교카페(홍길동)"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-slate-600">
                    계좌번호 *
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="예: 3333-01-2345678"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-black tracking-wider text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 4. 일일 정산 화면 4자리 PIN 번호 (현재 비밀번호 검증 후 변경) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                      <Lock className="h-4 w-4 text-emerald-600" />
                      일일 정산 화면(/admin) 잠금 비밀번호 관리
                    </label>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      현재 비밀번호:{' '}
                      <span className="font-mono font-black tracking-widest text-slate-700">
                        ••••
                      </span>{' '}
                      (보안 마스킹됨 · 변경 시 현재 비밀번호 확인 필요)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPinChangeOpen(!isPinChangeOpen);
                      setPinChangeError(null);
                      setCurrentPinInput('');
                      setNewPinInput('');
                      setConfirmNewPinInput('');
                    }}
                    className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                      isPinChangeOpen
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'border border-slate-300 bg-white text-slate-800 shadow-2xs hover:bg-slate-100'
                    }`}
                  >
                    {isPinChangeOpen ? '변경 취소' : '비밀번호 변경하기'}
                  </button>
                </div>

                {pinChangeSuccess && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-100 px-3.5 py-2.5 text-xs font-extrabold text-emerald-800">
                    <Check className="h-4 w-4" />
                    새 4자리 비밀번호로 안전하게 변경되었습니다!
                  </div>
                )}

                {isPinChangeOpen && (
                  <div className="mt-3.5 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <span className="block text-[11px] font-extrabold text-slate-600">
                          1. 현재 비밀번호 (4자리)
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="현재 PIN"
                          value={currentPinInput}
                          onChange={(e) => {
                            setPinChangeError(null);
                            setCurrentPinInput(
                              e.target.value.replace(/\D/g, '').slice(0, 4)
                            );
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-center font-mono text-base font-black tracking-[0.4em] text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <span className="block text-[11px] font-extrabold text-slate-600">
                          2. 새 비밀번호 (4자리)
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="새 PIN"
                          value={newPinInput}
                          onChange={(e) => {
                            setPinChangeError(null);
                            setNewPinInput(
                              e.target.value.replace(/\D/g, '').slice(0, 4)
                            );
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-center font-mono text-base font-black tracking-[0.4em] text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <span className="block text-[11px] font-extrabold text-slate-600">
                          3. 새 비밀번호 재확인
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="새 PIN 확인"
                          value={confirmNewPinInput}
                          onChange={(e) => {
                            setPinChangeError(null);
                            setConfirmNewPinInput(
                              e.target.value.replace(/\D/g, '').slice(0, 4)
                            );
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-center font-mono text-base font-black tracking-[0.4em] text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {pinChangeError && (
                      <p className="text-xs font-extrabold text-rose-600">
                        ⚠️ {pinChangeError}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={
                          savingPin ||
                          currentPinInput.length !== 4 ||
                          newPinInput.length !== 4 ||
                          confirmNewPinInput.length !== 4
                        }
                        onClick={handlePinChangeSubmit}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-xs transition hover:bg-emerald-700 disabled:bg-slate-300"
                      >
                        {savingPin ? '변경 중...' : '새 비밀번호로 변경 확정'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-base font-black text-white shadow-lg transition hover:bg-slate-800 disabled:bg-slate-400"
              >
                <Save className="h-5 w-5 text-amber-400" />
                {savingSettings
                  ? '설정 저장 중...'
                  : '카페 기본정보 · 계좌 · 운영설정 저장하기'}
              </button>
            </form>

            {/* 우측: 손님 스마트폰 화면 실시간 미리보기 (5 cols) */}
            <div className="flex flex-col justify-between bg-slate-100 p-6 lg:col-span-5">
              <div>
                <span className="inline-block rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-amber-400">
                  손님 스마트폰(/order) 실시간 미리보기
                </span>
                <p className="mt-1.5 text-xs text-slate-500">
                  왼쪽에서 입력한 내용이 손님 휴대폰에 아래와 같이 표시됩니다.
                </p>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white">
                      <Coffee className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {cafeName || '선교카페 이름'} 모바일 주문
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isQrOrderEnabled
                          ? '주문 즉시 제조 현황이 스마트폰으로 실시간 알림됩니다'
                          : '⚠️ 현재 모바일 QR 주문 일시중지 상태'}
                      </p>
                    </div>
                  </div>
                </div>

                {!isQrOrderEnabled && (
                  <div className="mt-3 rounded-2xl border border-amber-400 bg-amber-50 p-3.5 text-xs font-bold text-amber-900">
                    ⏸️ {qrPauseMessage}
                  </div>
                )}

                <div className="mt-4 rounded-3xl border-2 border-blue-200 bg-blue-50/80 p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-extrabold text-white">
                      입금 계좌 안내
                    </span>
                    <span className="text-xs font-bold text-blue-900">
                      예금주: {accountHolder || '예금주명'}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-sm font-bold text-slate-700">
                      {bankName || '은행명'}
                    </p>
                    <p className="mt-0.5 font-mono text-xl font-black tracking-wider text-slate-900">
                      {accountNumber || '0000-00-0000000'}
                    </p>
                  </div>

                  <div className="mt-3 rounded-xl bg-blue-600 py-3 text-center text-xs font-extrabold text-white">
                    계좌번호 원클릭 복사하기 (복사 텍스트: {bankName}{' '}
                    {accountNumber})
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                <p className="font-extrabold text-slate-900">
                  💡 삭제 대신 '숨겨두기'를 활용할 수 있는 4가지!
                </p>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed">
                  <li>
                    1. <strong>카테고리 숨김</strong>: 여름/겨울 시즌 탭이나 디저트 탭을 통째로 숨겼다가 다시 켜기
                  </li>
                  <li>
                    2. <strong>개별 메뉴 숨김</strong>: 당분간 안 파는 메뉴를 지우지 않고 메뉴판에서만 감추기
                  </li>
                  <li>
                    3. <strong>QR 주문 일시중지</strong>: 예배 시간·재료 준비 중 모바일 주문만 잠깐 멈추기
                  </li>
                  <li>
                    4. <strong>결제수단 숨김</strong>: 잔돈이 없는 날 '현금결제'를 잠깐 숨기고 계좌이체만 받기
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
