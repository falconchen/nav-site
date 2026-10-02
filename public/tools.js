// 常用工具页（tools.html）：Base64 编解码、密码生成器、UUID 生成器、URL 编解码、二维码生成
// 全部在浏览器本地计算，不发请求。纯函数挂在 NavTools 上，test/tools.spec.js 直接导入测试
(function () {
    const PASSWORD_MIN_LENGTH = 5;
    const PASSWORD_MAX_LENGTH = 128;
    const PASSWORD_MAX_MIN_COUNT = 9;
    const UUID_MAX_COUNT = 100;
    const PASSWORD_OPTIONS_KEY = 'toolsPasswordOptions';
    const TOOL_TAB_KEY = 'toolsTab';
    const COPIED_FEEDBACK_MS = 1500;
    const QR_LEVELS = ['L', 'M', 'Q', 'H'];
    // 二维码四周的留白（格数），规范要求至少 4 格，少了有的扫码器认不出
    const QR_QUIET_ZONE = 4;
    // 画布边长的下限（像素）：下载的图片要够清晰
    const QR_MIN_IMAGE_SIZE = 720;

    // 易混淆的 I O l 0 1 单独放，勾了「避免易混淆的字符」就不拼进去
    const CHARSETS = {
        uppercase: { base: 'ABCDEFGHJKLMNPQRSTUVWXYZ', ambiguous: 'IO' },
        lowercase: { base: 'abcdefghijkmnopqrstuvwxyz', ambiguous: 'l' },
        number: { base: '23456789', ambiguous: '01' },
        special: { base: '!@#$%^&*', ambiguous: '' }
    };
    const CHAR_TYPES = Object.keys(CHARSETS);

    const DEFAULT_PASSWORD_OPTIONS = {
        length: 14,
        uppercase: true,
        lowercase: true,
        number: true,
        special: false,
        minNumber: 1,
        minSpecial: 0,
        avoidAmbiguous: false
    };

    // ---- 随机数 ----

    // [0, max) 的均匀随机整数。直接取模会让小的余数多出现一点，超出整倍数范围的值丢掉重取
    function randomInt(max) {
        const limit = Math.floor(0x100000000 / max) * max;
        const buffer = new Uint32Array(1);
        do {
            crypto.getRandomValues(buffer);
        } while (buffer[0] >= limit);
        return buffer[0] % max;
    }

    function shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = randomInt(i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    function clampInt(value, min, max, fallback) {
        const number = parseInt(value, 10);
        if (Number.isNaN(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    // ---- 密码 ----

    // 规则照 Bitwarden：一类都没选时用小写；选了的类型至少出现 1 个；
    // 最少个数加起来比长度还多时把长度抬上去
    function normalizePasswordOptions(raw = {}) {
        const merged = { ...DEFAULT_PASSWORD_OPTIONS, ...raw };
        const options = {
            uppercase: Boolean(merged.uppercase),
            lowercase: Boolean(merged.lowercase),
            number: Boolean(merged.number),
            special: Boolean(merged.special),
            avoidAmbiguous: Boolean(merged.avoidAmbiguous)
        };
        if (!CHAR_TYPES.some(type => options[type])) {
            options.lowercase = true;
        }

        options.minNumber = options.number
            ? Math.max(1, clampInt(merged.minNumber, 0, PASSWORD_MAX_MIN_COUNT, 1))
            : 0;
        options.minSpecial = options.special
            ? Math.max(1, clampInt(merged.minSpecial, 0, PASSWORD_MAX_MIN_COUNT, 1))
            : 0;

        const required = minCounts(options);
        const requiredTotal = CHAR_TYPES.reduce((sum, type) => sum + required[type], 0);
        options.length = Math.max(
            requiredTotal,
            clampInt(merged.length, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, DEFAULT_PASSWORD_OPTIONS.length)
        );
        return options;
    }

    function minCounts(options) {
        return {
            uppercase: options.uppercase ? 1 : 0,
            lowercase: options.lowercase ? 1 : 0,
            number: options.minNumber,
            special: options.minSpecial
        };
    }

    function charsetOf(type, avoidAmbiguous) {
        const { base, ambiguous } = CHARSETS[type];
        return avoidAmbiguous ? base : base + ambiguous;
    }

    function generatePassword(rawOptions) {
        const options = normalizePasswordOptions(rawOptions);
        const enabledTypes = CHAR_TYPES.filter(type => options[type]);
        const anyCharset = enabledTypes.map(type => charsetOf(type, options.avoidAmbiguous)).join('');

        // 先给每一类留够最少个数的位置，剩下的位置不限类型，再打乱
        const required = minCounts(options);
        const slots = [];
        enabledTypes.forEach(type => {
            for (let i = 0; i < required[type]; i++) slots.push(type);
        });
        while (slots.length < options.length) slots.push('any');
        shuffle(slots);

        return slots.map(slot => {
            const charset = slot === 'any' ? anyCharset : charsetOf(slot, options.avoidAmbiguous);
            return charset[randomInt(charset.length)];
        }).join('');
    }

    // ---- Base64 ----

    function encodeBase64(text, { urlSafe = false } = {}) {
        const bytes = new TextEncoder().encode(String(text));
        let binary = '';
        // 分块转换，避免大文本一次展开参数时栈溢出
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        const encoded = btoa(binary);
        return urlSafe
            ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
            : encoded;
    }

    // 标准和 URL 安全两种写法都认，空白和缺掉的 = 也不计较
    function decodeBase64(text) {
        let input = String(text).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
        if (/[^A-Za-z0-9+/]/.test(input)) {
            throw new Error('含有不属于 Base64 的字符');
        }
        if (input.length % 4 === 1) {
            throw new Error('长度不对，内容可能不完整');
        }
        input += '='.repeat((4 - input.length % 4) % 4);

        const binary = atob(input);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (error) {
            throw new Error('解码结果不是 UTF-8 文本');
        }
    }

    // ---- URL 编码（百分号编码） ----

    // 默认把 : / ? # & = 这些也编码，适合编码参数值；keepStructure 时保留它们，适合编码整条网址
    function encodeUrl(text, { keepStructure = false } = {}) {
        try {
            return keepStructure ? encodeURI(String(text)) : encodeURIComponent(String(text));
        } catch (error) {
            // 落单的代理项（半个 emoji）没法按 UTF-8 编码
            throw new Error('含有不完整的字符');
        }
    }

    function decodeUrl(text) {
        try {
            return decodeURIComponent(String(text));
        } catch (error) {
            throw new Error('% 后面不是合法的编码，内容可能不完整');
        }
    }

    // ---- UUID ----

    function randomUuid() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        // 非安全上下文（http 下的局域网地址）没有 randomUUID，按 v4 规则自己拼
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function formatUuid(uuid, { uppercase = false, hyphens = true } = {}) {
        let result = hyphens ? uuid : uuid.replace(/-/g, '');
        if (uppercase) result = result.toUpperCase();
        return result;
    }

    function generateUuid(options) {
        return formatUuid(randomUuid(), options);
    }

    // ---- 二维码 ----

    // lib 是 vendor/qrcode-generator.min.js 挂的全局 qrcode，测试里自己传进来
    function buildQrMatrix(text, level = 'M', lib = globalThis.qrcode) {
        // 库默认把一个字符当一个字节，中文会编错
        lib.stringToBytes = lib.stringToBytesFuncs['UTF-8'];
        // 版本填 0：按内容长度自动选最小的版本
        const qr = lib(0, QR_LEVELS.includes(level) ? level : 'M');
        qr.addData(String(text), 'Byte');
        try {
            qr.make();
        } catch (error) {
            throw new Error('内容太长，二维码放不下');
        }
        return {
            size: qr.getModuleCount(),
            isDark: (row, col) => qr.isDark(row, col)
        };
    }

    globalThis.NavTools = {
        DEFAULT_PASSWORD_OPTIONS,
        randomInt,
        normalizePasswordOptions,
        generatePassword,
        encodeBase64,
        decodeBase64,
        encodeUrl,
        decodeUrl,
        formatUuid,
        generateUuid,
        buildQrMatrix
    };

    if (typeof document === 'undefined') return;

    // ---- 界面 ----

    const byId = id => document.getElementById(id);

    // 复制成功后图标短暂换成对勾
    function markCopied(button) {
        const icon = button.querySelector('i');
        if (!button.dataset.icon) button.dataset.icon = icon.className;
        icon.className = 'fas fa-check';
        button.classList.add('copied');
        clearTimeout(button._copiedTimer);
        button._copiedTimer = setTimeout(() => {
            icon.className = button.dataset.icon;
            button.classList.remove('copied');
        }, COPIED_FEEDBACK_MS);
    }

    function copyWithFeedback(button, text) {
        if (!text) return;
        copyText(text)
            .then(() => markCopied(button))
            .catch(() => showNotification('复制失败，请手动复制', 'error'));
    }

    function setupPassword() {
        const output = byId('passwordOutput');
        const lengthInput = byId('passwordLength');
        const minNumberInput = byId('passwordMinNumber');
        const minSpecialInput = byId('passwordMinSpecial');
        const checkboxes = {
            uppercase: byId('passwordUppercase'),
            lowercase: byId('passwordLowercase'),
            number: byId('passwordNumber'),
            special: byId('passwordSpecial'),
            avoidAmbiguous: byId('passwordAvoidAmbiguous')
        };
        let password = '';

        function readForm() {
            const options = {
                length: lengthInput.value,
                minNumber: minNumberInput.value,
                minSpecial: minSpecialInput.value
            };
            Object.keys(checkboxes).forEach(key => {
                options[key] = checkboxes[key].checked;
            });
            return options;
        }

        function writeForm(options) {
            lengthInput.value = options.length;
            minNumberInput.value = options.minNumber;
            minSpecialInput.value = options.minSpecial;
            Object.keys(checkboxes).forEach(key => {
                checkboxes[key].checked = options[key];
            });
        }

        function render() {
            output.innerHTML = Array.from(password, char => {
                if (/\d/.test(char)) return `<span class="pw-digit">${char}</span>`;
                if (CHARSETS.special.base.includes(char)) return `<span class="pw-special">${escapeHtml(char)}</span>`;
                return char;
            }).join('');
        }

        // commit：把修正后的值写回表单并记住。正在输入长度时不写回，免得打到一半被改掉
        function refresh({ commit = true } = {}) {
            const options = normalizePasswordOptions(readForm());
            if (commit) {
                writeForm(options);
                try {
                    localStorage.setItem(PASSWORD_OPTIONS_KEY, JSON.stringify(options));
                } catch (error) {}
            }
            minNumberInput.disabled = !options.number;
            minSpecialInput.disabled = !options.special;
            password = generatePassword(options);
            render();
        }

        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(PASSWORD_OPTIONS_KEY)) || {};
        } catch (error) {}
        writeForm(normalizePasswordOptions(saved));

        [lengthInput, minNumberInput, minSpecialInput].forEach(input => {
            input.addEventListener('input', () => refresh({ commit: false }));
            input.addEventListener('change', () => refresh());
        });
        Object.values(checkboxes).forEach(checkbox => {
            checkbox.addEventListener('change', () => refresh());
        });
        byId('passwordRegenerate').addEventListener('click', () => refresh());
        byId('passwordCopy').addEventListener('click', e => copyWithFeedback(e.currentTarget, password));

        refresh();
    }

    // 「原文」和「编码结果」两个框实时互转，Base64 和 URL 编码共用。
    // 元素 id 按前缀约定：<prefix>Plain / Encoded / Error / Clear / CopyPlain / CopyEncoded，option 是那个开关的 id
    function setupConverter({ prefix, option, encode, decode }) {
        const plain = byId(`${prefix}Plain`);
        const encoded = byId(`${prefix}Encoded`);
        const optionBox = byId(option);
        const errorText = byId(`${prefix}Error`);

        function setError(message, field) {
            errorText.textContent = message;
            errorText.hidden = !message;
            plain.classList.toggle('has-error', Boolean(message) && field === plain);
            encoded.classList.toggle('has-error', Boolean(message) && field === encoded);
        }

        function runEncode() {
            try {
                encoded.value = plain.value ? encode(plain.value, optionBox.checked) : '';
                setError('');
            } catch (error) {
                setError(`无法编码：${error.message}`, plain);
            }
        }

        // 解不出来时保留原文不动，只提示
        function runDecode() {
            if (!encoded.value.trim()) {
                plain.value = '';
                setError('');
                return;
            }
            try {
                plain.value = decode(encoded.value);
                setError('');
            } catch (error) {
                setError(`无法解码：${error.message}`, encoded);
            }
        }

        plain.addEventListener('input', runEncode);
        encoded.addEventListener('input', runDecode);
        optionBox.addEventListener('change', () => {
            if (plain.value) runEncode();
        });
        byId(`${prefix}Clear`).addEventListener('click', () => {
            plain.value = '';
            encoded.value = '';
            setError('');
            plain.focus();
        });
        byId(`${prefix}CopyPlain`).addEventListener('click', e => copyWithFeedback(e.currentTarget, plain.value));
        byId(`${prefix}CopyEncoded`).addEventListener('click', e => copyWithFeedback(e.currentTarget, encoded.value));
    }

    function setupBase64() {
        setupConverter({
            prefix: 'base64',
            option: 'base64UrlSafe',
            encode: (text, urlSafe) => encodeBase64(text, { urlSafe }),
            decode: decodeBase64
        });
    }

    function setupUrlCodec() {
        setupConverter({
            prefix: 'url',
            option: 'urlKeepStructure',
            encode: (text, keepStructure) => encodeUrl(text, { keepStructure }),
            decode: decodeUrl
        });
    }

    function setupUuid() {
        const list = byId('uuidList');
        const countInput = byId('uuidCount');
        const uppercase = byId('uuidUppercase');
        const noHyphens = byId('uuidNoHyphens');
        let uuids = [];

        const formatted = () => uuids.map(uuid => formatUuid(uuid, {
            uppercase: uppercase.checked,
            hyphens: !noHyphens.checked
        }));

        function render() {
            list.innerHTML = formatted().map((uuid, index) => `
                <li class="uuid-item">
                    <code>${uuid}</code>
                    <button type="button" class="theme-toggle" data-index="${index}" title="复制" aria-label="复制这个 UUID">
                        <i class="fas fa-copy"></i>
                    </button>
                </li>`).join('');
        }

        function regenerate({ commit = true } = {}) {
            const count = clampInt(countInput.value, 1, UUID_MAX_COUNT, 1);
            if (commit) countInput.value = count;
            uuids = Array.from({ length: count }, () => generateUuid());
            render();
        }

        countInput.addEventListener('input', () => regenerate({ commit: false }));
        countInput.addEventListener('change', () => regenerate());
        // 大小写、连字符只是换个写法，不重新生成
        uppercase.addEventListener('change', render);
        noHyphens.addEventListener('change', render);
        byId('uuidRegenerate').addEventListener('click', () => regenerate());
        byId('uuidCopyAll').addEventListener('click', e => copyWithFeedback(e.currentTarget, formatted().join('\n')));
        list.addEventListener('click', e => {
            const button = e.target.closest('button[data-index]');
            if (button) copyWithFeedback(button, formatted()[Number(button.dataset.index)]);
        });

        regenerate();
    }

    function setupQrcode() {
        const input = byId('qrcodeText');
        const canvas = byId('qrcodeCanvas');
        const placeholder = byId('qrcodePlaceholder');
        const errorText = byId('qrcodeError');
        const downloadButton = byId('qrcodeDownload');
        const copyButton = byId('qrcodeCopy');
        const levels = Array.from(document.querySelectorAll('input[name="qrcodeLevel"]'));

        // 没有可用的码时收起画布、禁用按钮；message 非空表示出错
        function setState(ready, message = '') {
            canvas.hidden = !ready;
            placeholder.hidden = ready;
            downloadButton.disabled = !ready;
            copyButton.disabled = !ready;
            errorText.textContent = message;
            errorText.hidden = !message;
            input.classList.toggle('has-error', Boolean(message));
        }

        function draw() {
            if (!input.value) {
                setState(false);
                return;
            }
            let matrix;
            try {
                matrix = buildQrMatrix(input.value, levels.find(level => level.checked).value);
            } catch (error) {
                setState(false, error.message);
                return;
            }

            // 每格占整数个像素，放大后边缘才不会糊。始终白底黑码，不跟深色主题走，否则扫不出来
            const cells = matrix.size + QR_QUIET_ZONE * 2;
            const scale = Math.ceil(QR_MIN_IMAGE_SIZE / cells);
            canvas.width = cells * scale;
            canvas.height = cells * scale;
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#000';
            for (let row = 0; row < matrix.size; row++) {
                for (let col = 0; col < matrix.size; col++) {
                    if (matrix.isDark(row, col)) {
                        context.fillRect((col + QR_QUIET_ZONE) * scale, (row + QR_QUIET_ZONE) * scale, scale, scale);
                    }
                }
            }
            setState(true);
        }

        const toPngBlob = () => new Promise((resolve, reject) => {
            canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
        });

        input.addEventListener('input', draw);
        levels.forEach(level => level.addEventListener('change', draw));

        downloadButton.addEventListener('click', () => {
            toPngBlob().then(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'qrcode.png';
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            }).catch(() => showNotification('生成图片失败', 'error'));
        });

        if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem === 'function') {
            copyButton.addEventListener('click', () => {
                // Safari 要求在点击的同一拍里调用 write，所以把 Promise 直接交给 ClipboardItem，不先 await
                navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob() })])
                    .then(() => markCopied(copyButton))
                    .catch(() => showNotification('复制失败，可以改用下载', 'error'));
            });
        } else {
            copyButton.hidden = true;
        }

        draw();
    }

    // 当前工具写在 <html data-tool> 上（tools.html 头部内联脚本先设好），显示哪个面板由 CSS 决定
    function setupToolTabs() {
        const tabs = Array.from(document.querySelectorAll('.tool-tabs .view-tab'));
        const names = tabs.map(tab => tab.dataset.tool);

        function updateButtons() {
            const current = document.documentElement.dataset.tool;
            tabs.forEach(tab => {
                const active = tab.dataset.tool === current;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', active);
                tab.tabIndex = active ? 0 : -1;
            });
        }

        function switchTool(name) {
            if (!names.includes(name)) return;
            document.documentElement.dataset.tool = name;
            updateButtons();
            // 用 replaceState 记进网址，方便收藏某个工具，又不往历史里塞记录
            history.replaceState(null, '', `#${name}`);
            try {
                localStorage.setItem(TOOL_TAB_KEY, name);
            } catch (error) {}
        }

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => switchTool(tab.dataset.tool));
            tab.addEventListener('keydown', e => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                const step = e.key === 'ArrowRight' ? 1 : -1;
                const next = tabs[(index + step + tabs.length) % tabs.length];
                switchTool(next.dataset.tool);
                next.focus();
            });
        });
        window.addEventListener('hashchange', () => switchTool(location.hash.slice(1)));

        updateButtons();
    }

    function init() {
        setupToolTabs();
        setupPassword();
        setupBase64();
        setupUrlCodec();
        setupUuid();
        setupQrcode();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
