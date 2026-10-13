/**
 * MCP 协议层：Streamable HTTP 上的无状态 JSON-RPC，只提供 tools
 *
 * 每个 POST 是一条独立的请求，回一个 JSON 对象，不开 SSE、不发会话 id。同一个端点兼容两代协议：
 * - 2026-07-28 起没有握手，版本号放在每条请求的 params._meta 里，并镜像到请求头；
 *   这类请求要核对请求头和请求体一致，结果里带 resultType
 * - 2025-11-25 及更早先发 initialize 握手。服务端本来就不记状态，握手只是回一下版本和能力
 *
 * 没用官方 SDK：只需要下面这几个方法，手写比引入 SDK + zod 轻得多。
 */

export const MODERN_VERSIONS = ['2026-07-28'];
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SUPPORTED_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];

// 每次改 MCP 的功能都要升 version，规则见 CLAUDE.md「MCP」一节。握手和每条结果里都会带上它，排查「客户端连的是不是新版本」时用。
// 注意 ChatGPT 插件页上的「版本」不是这个值，那是它自己的插件清单里的
export const SERVER_INFO = { name: 'pipi2047', title: '皮皮2047', version: '1.1.0' };

const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_VERSION = -32022;

// 工具列表是写死在代码里的，客户端可以放心缓存一阵
const TOOLS_TTL_MS = 60 * 60 * 1000;

/**
 * 工具执行失败、且原因可以直接讲给模型听的错误。message 会原样出现在工具结果里
 */
export class ToolError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ToolError';
    }
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

function rpcError(id, code, message, { status = 200, data } = {}) {
    const error = data === undefined ? { code, message } : { code, message, data };
    return json({ jsonrpc: '2.0', id: id ?? null, error }, status);
}

// 请求头里放不下的值（非 ASCII、首尾空白）会写成 =?base64?...?=
function decodeHeaderValue(value) {
    const match = /^=\?base64\?(.*)\?=$/.exec(value);
    if (!match) return value;
    try {
        const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function toolView(tool) {
    const view = { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
    if (tool.title) view.title = tool.title;
    if (tool.annotations) view.annotations = tool.annotations;
    return view;
}

async function callTool(tools, params, context, beforeCall) {
    const tool = tools.find((item) => item.name === params?.name);
    if (!tool) {
        return { rpcError: [INVALID_PARAMS, `Unknown tool: ${String(params?.name)}`] };
    }
    const args = params.arguments ?? {};
    if (typeof args !== 'object' || Array.isArray(args)) {
        return { rpcError: [INVALID_PARAMS, 'Tool arguments must be an object'] };
    }

    try {
        if (beforeCall) await beforeCall(tool);
        const value = await tool.handler(args, context);
        return { result: { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false } };
    } catch (error) {
        if (!(error instanceof ToolError)) {
            console.error(`MCP 工具 ${tool.name} 执行出错:`, error);
        }
        const text = error instanceof ToolError ? error.message : '服务器内部错误，请稍后再试';
        return { result: { content: [{ type: 'text', text }], isError: true } };
    }
}

/**
 * 处理一个发到 MCP 端点的 POST
 *
 * @param {Request} request
 * @param {Object} options
 * @param {Array} options.tools 工具定义：{ name, title, description, inputSchema, annotations, handler(args, context) }
 * @param {Object} options.context 原样传给工具的 handler
 * @param {string} [options.instructions] 给模型看的使用说明
 * @param {Function} [options.beforeCall] 每次调用工具前执行，抛 ToolError 可以拒绝（限流用）
 * @returns {Promise<Response>}
 */
export async function handleMcpPost(request, { tools, context, instructions, beforeCall }) {
    let message;
    try {
        message = await request.json();
    } catch {
        return rpcError(null, PARSE_ERROR, 'Parse error', { status: 400 });
    }
    if (Array.isArray(message)) {
        return rpcError(null, INVALID_REQUEST, 'JSON-RPC batching is not supported', { status: 400 });
    }
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
        return rpcError(null, INVALID_REQUEST, 'Invalid JSON-RPC message', { status: 400 });
    }

    // 通知（没有 id）和客户端发来的响应都不需要回内容
    const { id, method, params } = message;
    if (typeof method !== 'string' || id === undefined || id === null) {
        return new Response(null, { status: 202 });
    }

    const bodyVersion = params?._meta?.[META_VERSION];
    const headerVersion = request.headers.get('MCP-Protocol-Version');
    const isModern = typeof bodyVersion === 'string'
        || MODERN_VERSIONS.includes(headerVersion)
        || method === 'server/discover';

    if (isModern) {
        return handleModern(request, { id, method, params, bodyVersion, headerVersion }, { tools, context, instructions, beforeCall });
    }

    if (headerVersion && !LEGACY_VERSIONS.includes(headerVersion)) {
        return rpcError(id, INVALID_REQUEST, `Unsupported protocol version: ${headerVersion}`, {
            status: 400,
            data: { supported: SUPPORTED_VERSIONS, requested: headerVersion }
        });
    }

    switch (method) {
        case 'initialize': {
            const requested = params?.protocolVersion;
            const result = {
                protocolVersion: LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0],
                capabilities: { tools: {} },
                serverInfo: SERVER_INFO
            };
            if (instructions) result.instructions = instructions;
            return json({ jsonrpc: '2.0', id, result });
        }
        case 'ping':
            return json({ jsonrpc: '2.0', id, result: {} });
        case 'tools/list':
            return json({ jsonrpc: '2.0', id, result: { tools: tools.map(toolView) } });
        case 'tools/call': {
            const outcome = await callTool(tools, params, context, beforeCall);
            if (outcome.rpcError) return rpcError(id, ...outcome.rpcError);
            return json({ jsonrpc: '2.0', id, result: outcome.result });
        }
        default:
            return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
}

async function handleModern(request, { id, method, params, bodyVersion, headerVersion }, { tools, context, instructions, beforeCall }) {
    const mismatch = (text) => rpcError(id, HEADER_MISMATCH, `Header mismatch: ${text}`, { status: 400 });

    // server/discover 是用来探测版本的，什么都没带也照答；其它请求要求请求头和请求体对得上
    const probing = method === 'server/discover' && bodyVersion === undefined && !headerVersion;
    if (!probing) {
        if (typeof bodyVersion !== 'string') {
            return mismatch(`params._meta["${META_VERSION}"] is required`);
        }
        if (!headerVersion) return mismatch('MCP-Protocol-Version header is required');
        if (headerVersion !== bodyVersion) {
            return mismatch(`MCP-Protocol-Version header value '${headerVersion}' does not match body value '${bodyVersion}'`);
        }
        if (!MODERN_VERSIONS.includes(bodyVersion)) {
            return rpcError(id, UNSUPPORTED_VERSION, 'Unsupported protocol version', {
                status: 400,
                data: { supported: SUPPORTED_VERSIONS, requested: bodyVersion }
            });
        }

        const headerMethod = request.headers.get('Mcp-Method');
        if (!headerMethod) return mismatch('Mcp-Method header is required');
        if (headerMethod !== method) {
            return mismatch(`Mcp-Method header value '${headerMethod}' does not match body value '${method}'`);
        }
        if (method === 'tools/call') {
            const rawName = request.headers.get('Mcp-Name');
            if (!rawName) return mismatch('Mcp-Name header is required');
            const headerName = decodeHeaderValue(rawName);
            if (headerName !== params?.name) {
                return mismatch(`Mcp-Name header value '${rawName}' does not match body value '${String(params?.name)}'`);
            }
        }
    }

    const complete = (result) => json({
        jsonrpc: '2.0',
        id,
        result: { resultType: 'complete', ...result, _meta: { [META_SERVER_INFO]: SERVER_INFO } }
    });

    switch (method) {
        case 'server/discover': {
            const result = {
                supportedVersions: SUPPORTED_VERSIONS,
                capabilities: { tools: {} },
                ttlMs: TOOLS_TTL_MS,
                cacheScope: 'public'
            };
            if (instructions) result.instructions = instructions;
            return complete(result);
        }
        case 'tools/list':
            return complete({ tools: tools.map(toolView), ttlMs: TOOLS_TTL_MS, cacheScope: 'public' });
        case 'tools/call': {
            const outcome = await callTool(tools, params, context, beforeCall);
            if (outcome.rpcError) return rpcError(id, ...outcome.rpcError);
            return complete(outcome.result);
        }
        default:
            return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`, { status: 404 });
    }
}
