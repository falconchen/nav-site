import { describe, it, expect } from 'vitest';
import { refreshProviderProfile } from '../server/lib/oauth-profile.js';

function makeUser() {
    const google = { provider: 'google', providerId: 'g1', name: 'JS Next', avatar_url: 'https://lh3.example/old' };
    const github = { provider: 'github', providerId: 'h1', name: 'nextjsisfine', avatar_url: 'https://avatars.example/gh' };
    // 账号先用 Google 创建，顶层资料来自 Google
    return { user: { name: 'JS Next', avatar_url: 'https://lh3.example/old', providers: [google, github] }, google, github };
}

describe('refreshProviderProfile', () => {
    it('Google 换了头像和名字，顶层资料原本来自 Google，一起更新', () => {
        const { user, google } = makeUser();
        const changed = refreshProviderProfile(user, google, { name: 'JS New', avatar_url: 'https://lh3.example/new' });

        expect(changed).toBe(true);
        expect(google).toMatchObject({ name: 'JS New', avatar_url: 'https://lh3.example/new' });
        expect(user).toMatchObject({ name: 'JS New', avatar_url: 'https://lh3.example/new' });
    });

    it('用 GitHub 登录时只刷新 GitHub 那一项，顶层仍是 Google 的，不来回切换', () => {
        const { user, github } = makeUser();
        refreshProviderProfile(user, github, { name: 'nextjsisfine', avatar_url: 'https://avatars.example/gh2' });

        expect(github.avatar_url).toBe('https://avatars.example/gh2');
        expect(user).toMatchObject({ name: 'JS Next', avatar_url: 'https://lh3.example/old' });
    });

    it('资料没变或 provider 没返回时不改动', () => {
        const { user, google } = makeUser();
        expect(refreshProviderProfile(user, google, { name: 'JS Next', avatar_url: 'https://lh3.example/old' })).toBe(false);
        expect(refreshProviderProfile(user, google, { name: '', avatar_url: undefined })).toBe(false);
        expect(user).toMatchObject({ name: 'JS Next', avatar_url: 'https://lh3.example/old' });
    });

    it('旧数据顶层没有头像时，用这次登录的补上', () => {
        const { user, github } = makeUser();
        delete user.avatar_url;
        refreshProviderProfile(user, github, { avatar_url: 'https://avatars.example/gh2' });

        expect(user.avatar_url).toBe('https://avatars.example/gh2');
    });
});
