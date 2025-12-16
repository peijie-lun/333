// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // Supabase 初始化
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const { email, password, name, phone } = await req.json();

    // 驗證輸入
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: '請提供 Email 和密碼' },
        { status: 400 }
      );
    }

    // 檢查 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Email 格式不正確' },
        { status: 400 }
      );
    }

    // 檢查密碼長度
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: '密碼至少需要 6 個字元' },
        { status: 400 }
      );
    }

    // 檢查 Email 是否已存在
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: '此 Email 已被註冊' },
        { status: 409 }
      );
    }

    // 插入新使用者（明文密碼）
    const { data: newUser, error: insertError } = await supabase
      .from('profiles')
      .insert([
        {
          email,
          password: password,
          name: name || null,
          phone: phone || null,
          role: 'resident',
          status: 'active',
        }
      ])
      .select('id, email, name, phone, role, status, created_at')
      .single();

    if (insertError) {
      console.error('❌ 註冊錯誤:', insertError);
      return NextResponse.json(
        { success: false, message: '註冊失敗，請稍後再試' },
        { status: 500 }
      );
    }

    console.log('✅ 新使用者註冊成功:', newUser.id);

    return NextResponse.json({
      success: true,
      message: '註冊成功',
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        phone: newUser.phone,
        role: newUser.role,
        status: newUser.status,
        created_at: newUser.created_at
      }
    });

  } catch (error: any) {
    console.error('❌ 註冊錯誤:', error);
    return NextResponse.json(
      { success: false, message: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}