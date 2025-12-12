// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // Supabase 初始化
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const { email, password } = await req.json();

    // 驗證輸入
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: '請提供 Email 和密碼' },
        { status: 400 }
      );
    }

    // 查詢使用者（包含 LINE 綁定資訊）
    const { data: user, error: queryError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        password,
        name,
        phone,
        role,
        status,
        line_user_id,
        line_display_name,
        line_avatar_url,
        line_status_message,
        tenant_id,
        unit_id,
        created_at
      `)
      .eq('email', email)
      .single();

    if (queryError || !user) {
      return NextResponse.json(
        { success: false, message: 'Email 或密碼錯誤' },
        { status: 401 }
      );
    }

    // 檢查帳號狀態
    if (user.status !== 'active') {
      return NextResponse.json(
        { success: false, message: '帳號已被停用，請聯繫管理員' },
        { status: 403 }
      );
    }

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: 'Email 或密碼錯誤' },
        { status: 401 }
      );
    }

    // 更新最後登入時間
    await supabase
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', user.id);

    console.log('✅ 使用者登入成功:', user.email);

    // 回傳使用者資訊（不包含密碼）
    return NextResponse.json({
      success: true,
      message: '登入成功',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        tenant_id: user.tenant_id,
        unit_id: user.unit_id,
        line_bound: !!user.line_user_id, // 是否已綁定 LINE
        line_display_name: user.line_display_name,
        line_avatar_url: user.line_avatar_url,
        line_status_message: user.line_status_message,
        created_at: user.created_at
      }
    });

  } catch (error: any) {
    console.error('❌ 登入錯誤:', error);
    return NextResponse.json(
      { success: false, message: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}