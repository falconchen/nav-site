require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  PASSWORD = "correct horse battery staple".freeze

  setup { @user = users(:alice) }

  test "登录页对未登录开放" do
    get new_session_path
    assert_response :success
  end

  test "密码正确则登录成功并建立会话" do
    assert_difference "Session.count", 1 do
      post session_path, params: { email_address: @user.email_address, password: PASSWORD }
    end

    assert_redirected_to root_path
    assert cookies[:session_id]
  end

  test "密码错误不建立会话" do
    assert_no_difference "Session.count" do
      post session_path, params: { email_address: @user.email_address, password: "wrong password here" }
    end

    assert_redirected_to new_session_path
    assert_nil cookies[:session_id]
  end

  test "邮箱不存在不建立会话" do
    assert_no_difference "Session.count" do
      post session_path, params: { email_address: "nobody@example.com", password: PASSWORD }
    end

    assert_redirected_to new_session_path
  end

  # 会话存在数据库里，登出要真的把行删掉 —— 这正是旧版 JWT 做不到的
  test "登出会删除会话记录" do
    sign_in_as @user

    assert_difference "Session.count", -1 do
      delete session_path
    end

    assert_redirected_to new_session_path
    assert_empty cookies[:session_id]
  end

  test "未登录访问根路径跳登录页" do
    get root_path
    assert_redirected_to new_session_path
  end
end
