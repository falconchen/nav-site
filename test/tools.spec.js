import { describe, it, expect } from 'vitest';
import '../public/tools.js';

const {
	normalizePasswordOptions,
	generatePassword,
	encodeBase64,
	decodeBase64,
	encodeUrl,
	decodeUrl,
	generateUuid,
	randomInt
} = globalThis.NavTools;

// 随机结果多跑几次，偶发的违规也能撞出来
function times(count, fn) {
	for (let i = 0; i < count; i++) fn();
}

describe('randomInt', () => {
	it('结果落在 [0, max) 里', () => {
		times(500, () => {
			const value = randomInt(7);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(7);
		});
	});
});

describe('密码生成器', () => {
	it('默认 14 位，含大小写和数字，不含特殊字符', () => {
		times(50, () => {
			const password = generatePassword();
			expect(password).toMatch(/^[A-Za-z0-9]{14}$/);
			expect(password).toMatch(/[A-Z]/);
			expect(password).toMatch(/[a-z]/);
			expect(password).toMatch(/[0-9]/);
		});
	});

	it('只用勾选的字符集', () => {
		times(50, () => {
			const password = generatePassword({ length: 20, uppercase: false, lowercase: false, number: true, special: true });
			expect(password).toMatch(/^[0-9!@#$%^&*]{20}$/);
		});
	});

	it('数字和特殊字符不少于最少个数', () => {
		times(50, () => {
			const password = generatePassword({ length: 12, special: true, minNumber: 4, minSpecial: 3 });
			expect(password).toHaveLength(12);
			expect(password.match(/[0-9]/g).length).toBeGreaterThanOrEqual(4);
			expect(password.match(/[!@#$%^&*]/g).length).toBeGreaterThanOrEqual(3);
		});
	});

	it('避免易混淆的字符', () => {
		times(50, () => {
			expect(generatePassword({ length: 128, avoidAmbiguous: true })).not.toMatch(/[IOl01]/);
		});
	});

	it('一类都没勾时用小写', () => {
		const options = { uppercase: false, lowercase: false, number: false, special: false };
		expect(normalizePasswordOptions(options).lowercase).toBe(true);
		expect(generatePassword({ ...options, length: 10 })).toMatch(/^[a-z]{10}$/);
	});

	it('勾了的类型最少个数按 1 算，没勾的按 0 算', () => {
		const options = normalizePasswordOptions({ number: true, minNumber: 0, special: false, minSpecial: 5 });
		expect(options.minNumber).toBe(1);
		expect(options.minSpecial).toBe(0);
	});

	it('最少个数加起来超过长度时抬高长度', () => {
		const options = normalizePasswordOptions({ length: 5, special: true, minNumber: 9, minSpecial: 9 });
		expect(options.length).toBe(20);
		expect(generatePassword(options)).toHaveLength(20);
	});

	it('长度夹在 5 到 128 之间，乱填回到默认值', () => {
		expect(normalizePasswordOptions({ length: 1 }).length).toBe(5);
		expect(normalizePasswordOptions({ length: 999 }).length).toBe(128);
		expect(normalizePasswordOptions({ length: '' }).length).toBe(14);
	});
});

describe('Base64', () => {
	it('中文和 emoji 能往返', () => {
		const text = '皮皮2047 私人网址簿 🧧\n第二行';
		expect(decodeBase64(encodeBase64(text))).toBe(text);
	});

	it('和标准结果一致', () => {
		expect(encodeBase64('hello')).toBe('aGVsbG8=');
		expect(encodeBase64('你好')).toBe('5L2g5aW9');
		expect(encodeBase64('')).toBe('');
	});

	it('URL 安全写法不含 + / =，也能解回来', () => {
		const text = '???>>>~~~';
		const encoded = encodeBase64(text, { urlSafe: true });
		expect(encodeBase64(text)).toMatch(/[+/]/);
		expect(encoded).not.toMatch(/[+/=]/);
		expect(decodeBase64(encoded)).toBe(text);
	});

	it('缺填充、带空白也能解', () => {
		expect(decodeBase64('aGVsbG8')).toBe('hello');
		expect(decodeBase64(' aGVs\nbG8= ')).toBe('hello');
	});

	it('大段文本不会栈溢出', () => {
		const text = '导航'.repeat(100000);
		expect(decodeBase64(encodeBase64(text))).toBe(text);
	});

	it('非法输入抛错', () => {
		expect(() => decodeBase64('不是 base64')).toThrow();
		expect(() => decodeBase64('a=bc')).toThrow();
		expect(() => decodeBase64('abcde')).toThrow();
		// 合法 Base64，但字节不是 UTF-8
		expect(() => decodeBase64('/w==')).toThrow();
	});
});

describe('URL 编码', () => {
	it('默认连网址符号一起编码', () => {
		expect(encodeUrl('你好 world')).toBe('%E4%BD%A0%E5%A5%BD%20world');
		expect(encodeUrl('https://a.com/搜索?q=1&b=2#x')).toBe('https%3A%2F%2Fa.com%2F%E6%90%9C%E7%B4%A2%3Fq%3D1%26b%3D2%23x');
	});

	it('保留网址符号时只编码非 ASCII 和空格', () => {
		expect(encodeUrl('https://a.com/搜索 页?q=1&b=2#x', { keepStructure: true }))
			.toBe('https://a.com/%E6%90%9C%E7%B4%A2%20%E9%A1%B5?q=1&b=2#x');
	});

	it('两种写法都能解回来', () => {
		const text = 'https://a.com/搜索?q=皮皮 2047&emoji=🧧';
		expect(decodeUrl(encodeUrl(text))).toBe(text);
		expect(decodeUrl(encodeUrl(text, { keepStructure: true }))).toBe(text);
		expect(decodeUrl('没有编码的内容')).toBe('没有编码的内容');
	});

	it('编码不完整时抛错', () => {
		expect(() => decodeUrl('%E4%BD')).toThrow();
		expect(() => decodeUrl('100%')).toThrow();
		expect(() => encodeUrl('\uD83E')).toThrow();
	});
});

describe('UUID', () => {
	it('默认是小写带连字符的 v4', () => {
		times(20, () => {
			expect(generateUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		});
	});

	it('大写、去掉连字符', () => {
		expect(generateUuid({ uppercase: true })).toMatch(/^[0-9A-F-]{36}$/);
		expect(generateUuid({ hyphens: false })).toMatch(/^[0-9a-f]{32}$/);
	});
});
