import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Supabase 무료 플랜 7일 미사용 일시정지(Pause) 방지용 Keep-Alive 엔드포인트
 * Vercel Cron (vercel.json)에 의해 정기적으로 호출되어 cafe_settings 테이블을 1회 조회합니다.
 */
export async function GET() {
  const checkedAt = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json({
      ok: true,
      mode: 'local-demo',
      message:
        'Supabase 환경변수가 아직 설정되지 않았습니다 (로컬 데모 모드 동작 중).',
      checkedAt,
    });
  }

  try {
    const { data, error } = await supabase
      .from('cafe_settings')
      .select('id, cafe_name, updated_at')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          mode: 'supabase',
          error: error.message,
          checkedAt,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: 'supabase',
      status: 'alive',
      cafeName: data?.cafe_name || '은혜 선교카페',
      checkedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        mode: 'supabase',
        error: err instanceof Error ? err.message : 'Unknown error',
        checkedAt,
      },
      { status: 500 }
    );
  }
}
