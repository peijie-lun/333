// app/api/bind-line/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // Supabase 初始化
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const {
      profile_id,
      line_user_id,
      line_display_name,
      line_avatar_url,
      line_status_message
    } = await req.json();

    // 驗證必要欄位
    if (!profile_id || !line_user_id) {
      return NextResponse.json(
        { success: false, message: '缺少必要參數 (profile_id 或 line_user_id)' },
        { status: 400 }
      );
    }

    // 在接收請求時增加詳細日誌
    console.log('📥 收到 LINE 綁定請求:', {
      profile_id,
      line_user_id,
      line_display_name
    });
    console.log('📥 綁定請求參數:', { profile_id, line_user_id, line_display_name, line_avatar_url, line_status_message });

    // 1. 檢查 profile_id 是否存在
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name, line_user_id, status')
      .eq('id', profile_id)
      .single();

    // 在查詢 profiles 表時增加錯誤日誌
    if (profileError || !currentProfile) {
      console.error('❌ 查詢 profiles 表失敗:', { profile_id, error: profileError });
      return NextResponse.json(
        { success: false, message: '使用者不存在' },
        { status: 404 }
      );
    }

    // 檢查帳號狀態
    if (currentProfile.status !== 'active') {
      return NextResponse.json(
        { success: false, message: '帳號已被停用，無法綁定 LINE' },
        { status: 403 }
      );
    }

    // 2. 檢查此 profile 是否已綁定其他 LINE 帳號
    if (currentProfile.line_user_id && currentProfile.line_user_id !== line_user_id) {
      console.warn('⚠️ 帳號已綁定其他 LINE:', currentProfile.line_user_id);
      return NextResponse.json(
        { 
          success: false, 
          message: `此帳號已綁定 LINE (${currentProfile.line_user_id})，請先解除綁定` 
        },
        { status: 409 }
      );
    }

    // 3. 檢查此 LINE 帳號是否已被其他 profile 綁定
    const { data: existingUser, error: lineError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('line_user_id', line_user_id)
      .neq('id', profile_id)
      .single();

    if (existingUser) {
      console.warn('⚠️ LINE 帳號已被其他使用者綁定:', existingUser.email);
      return NextResponse.json(
        { 
          success: false, 
          message: `此 LINE 帳號已被帳號 ${existingUser.email} 綁定` 
        },
        { status: 409 }
      );
    }

    // 4. 更新 profile，綁定 LINE 資訊
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        line_user_id,
        line_display_name: line_display_name || null,
        line_avatar_url: line_avatar_url || null,
        line_status_message: line_status_message || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', profile_id)
      .select(`
        id,
        email,
        name,
        phone,
        role,
        line_user_id,
        line_display_name,
        line_avatar_url,
        line_status_message,
        updated_at
      `)
      .single();

    if (updateError || !updatedProfile) {
      console.error('❌ 更新失敗:', updateError);
      return NextResponse.json(
        { success: false, message: '綁定失敗，請稍後再試' },
        { status: 500 }
      );
    }

    console.log('✅ LINE 綁定成功:', {
      profile_id: updatedProfile.id,
      email: updatedProfile.email,
      line_user_id: updatedProfile.line_user_id,
      line_display_name: updatedProfile.line_display_name
    });

    return NextResponse.json({
      success: true,
      message: 'LINE 綁定成功',
      profile: {
        id: updatedProfile.id,
        email: updatedProfile.email,
        name: updatedProfile.name,
        phone: updatedProfile.phone,
        role: updatedProfile.role,
        line_user_id: updatedProfile.line_user_id,
        line_display_name: updatedProfile.line_display_name,
        line_avatar_url: updatedProfile.line_avatar_url,
        line_status_message: updatedProfile.line_status_message,
        updated_at: updatedProfile.updated_at
      }
    });

  } catch (error: any) {
    console.error('❌ LINE 綁定錯誤:', error);

    // 處理 unique constraint 違反錯誤
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, message: '此 LINE 帳號已被其他使用者綁定' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: '伺服器錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}

// 解除 LINE 綁定 API
export async function DELETE(req: NextRequest) {
  try {
    // Supabase 初始化
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );

    const { profile_id } = await req.json();

    if (!profile_id) {
      return NextResponse.json(
        { success: false, message: '缺少 profile_id' },
        { status: 400 }
      );
    }

    console.log('🔓 解除 LINE 綁定請求:', profile_id);

    const { data: profile, error: updateError } = await supabase
      .from('profiles')
      .update({
        line_user_id: null,
        line_display_name: null,
        line_avatar_url: null,
        line_status_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', profile_id)
      .select('id, email, name')
      .single();

    if (updateError || !profile) {
      return NextResponse.json(
        { success: false, message: '使用者不存在' },
        { status: 404 }
      );
    }

    console.log('✅ LINE 綁定已解除:', profile.email);

    return NextResponse.json({
      success: true,
      message: 'LINE 綁定已解除',
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name
      }
    });

  } catch (error: any) {
    console.error('❌ 解除綁定錯誤:', error);
    return NextResponse.json(
      { success: false, message: '伺服器錯誤' },
      { status: 500 }
    );
  }
}