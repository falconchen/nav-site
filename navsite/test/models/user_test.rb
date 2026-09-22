require "test_helper"

class UserTest < ActiveSupport::TestCase
  test "邮箱去空格并转小写" do
    user = User.new(email_address: " DOWNCASED@EXAMPLE.COM ")
    assert_equal "downcased@example.com", user.email_address
  end

  test "邮箱格式不合法被拒" do
    user = User.new(email_address: "not-an-email", password: "a" * 12)
    assert_not user.valid?
    assert_includes user.errors[:email_address], "格式不正确"
  end

  test "邮箱唯一" do
    user = User.new(email_address: users(:alice).email_address, password: "a" * 12)
    assert_not user.valid?
  end

  # has_secure_password 默认不校验最小长度，这条是自己加的
  test "密码短于 12 位被拒" do
    user = User.new(email_address: "short@example.com", password: "a" * 11)
    assert_not user.valid?
    assert_not_empty user.errors[:password]
  end

  test "密码满 12 位通过" do
    user = User.new(email_address: "ok@example.com", password: "a" * 12)
    assert user.valid?, user.errors.full_messages.to_sentence
  end

  # 删用户会连带销毁他的分类，其中包括那条 builtin 的「未分类」。
  # 若 guard_builtin 不放行连带销毁，会抛 :abort 让整条链回滚，用户永远删不掉。
  test "删用户会连带清掉他的全部数据" do
    user = users(:alice)
    assert user.categories.exists?(builtin: true), "前提：alice 有一条 builtin 分类"

    assert_difference ->{ User.count } => -1,
                      ->{ Category.where(user: user).count } => -user.categories.count,
                      ->{ Website.where(user: user).count } => -user.websites.count do
      assert user.destroy, "用户应当能被销毁：#{user.errors.full_messages.to_sentence}"
    end
  end

  test "删用户不影响别人的数据" do
    bob_sites = users(:bob).websites.count
    users(:alice).destroy

    assert_equal bob_sites, users(:bob).websites.count
  end
end
