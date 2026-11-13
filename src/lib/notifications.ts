import { OrderStatus } from '@/types/cafe';

/**
 * 별도의 외부 오디오 파일 없이 Web Audio API로 카페 알림 차임벨 소리 재생
 */
export function playStatusAlertSound(status: OrderStatus): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + startOffset + 0.03);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + startOffset + duration
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    if (status === 'ready') {
      // 제조 완료 (픽업 호출): 경쾌한 3음 차임벨 (도 - 미 - 솔 - 높은도)
      playTone(523.25, 0, 0.22); // C5
      playTone(659.25, 0.18, 0.22); // E5
      playTone(783.99, 0.36, 0.25); // G5
      playTone(1046.5, 0.56, 0.55); // C6
    } else if (status === 'preparing') {
      // 수신 확인 / 제조 시작: 부드러운 2음 알림 (도 - 솔)
      playTone(523.25, 0, 0.2);
      playTone(783.99, 0.18, 0.35);
    } else if (status === 'cancelled') {
      playTone(440, 0, 0.25);
      playTone(330, 0.22, 0.35);
    }
  } catch {
    // 브라우저 자동재생 정책 등으로 차단된 경우 무시
  }
}

/**
 * 모바일 진동 + 브라우저 시스템 푸시 알림(Notification API) 호출
 */
export function triggerCustomerPhoneAlert(
  orderNumber: number,
  customerName: string,
  status: OrderStatus
): void {
  if (typeof window === 'undefined') return;

  // 1. 사운드 재생
  playStatusAlertSound(status);

  // 2. 모바일 진동 (안드로이드 Chrome 등 지원 기기)
  if ('vibrate' in navigator) {
    try {
      if (status === 'ready') {
        navigator.vibrate([300, 120, 300, 120, 400]);
      } else {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {
      // Ignore
    }
  }

  // 3. 브라우저 시스템 푸시 알림 (권한 허용 시 상단 알림바 노출)
  if ('Notification' in window && Notification.permission === 'granted') {
    const title =
      status === 'preparing'
        ? `[주문 #${orderNumber}] 음료 제조가 시작되었습니다!`
        : status === 'ready'
          ? `[주문 #${orderNumber}] 음료 제조 완료! 픽업해 주세요 ☕`
          : status === 'completed'
            ? `[주문 #${orderNumber}] 전달이 완료되었습니다. 감사합니다!`
            : `[주문 #${orderNumber}] 주문이 취소되었습니다.`;

    const body =
      status === 'preparing'
        ? `${customerName}님, 주문을 확인하고 정성껏 음료를 제조 중입니다.`
        : status === 'ready'
          ? `${customerName}님, 주문하신 음료가 준비되었습니다. 카운터에서 픽업해 주세요!`
          : `${customerName}님, 이용해 주셔서 감사합니다.`;

    try {
      new Notification(title, {
        body,
        tag: `order-${orderNumber}-${status}`,
      });
    } catch {
      // 모바일 일부 환경에서 Notification 생성자 제한 시 무시
    }
  }
}
