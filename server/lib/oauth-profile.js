/**
 * 已绑定的 provider 再次登录时，用它这次返回的名字和头像刷新用户记录，
 * 用户在 Google / GitHub 那边改了资料，下次登录就同步过来。
 *
 * 顶层 name / avatar_url（页面右上角显示的）只在原本就来自这个 provider 时才跟着换：
 * 同时绑了 Google 和 GitHub 的账号，否则每换一种方式登录头像就来回切换。
 *
 * 直接修改传入的 user 和 provider，返回是否有变化。
 */
export function refreshProviderProfile(user, provider, info) {
    let changed = false;

    for (const field of ['avatar_url', 'name']) {
        const next = info[field];
        if (!next || next === provider[field]) continue;
        if (!user[field] || user[field] === provider[field]) {
            user[field] = next;
        }
        provider[field] = next;
        changed = true;
    }

    return changed;
}
