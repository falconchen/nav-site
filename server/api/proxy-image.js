import { Hono } from 'hono';
import { fetchRemoteImage } from '../lib/fetch-remote-image.js';

const app = new Hono();

// 图片代理API - 解决跨域问题
app.get('/proxy-image', async (c) => {
    try {
      // 获取图片URL参数
      const imageUrl = c.req.query('url');

      if (!imageUrl) {
        return c.json({ error: '缺少图片URL参数' }, 400);
      }

      console.log('代理获取图片:', imageUrl);

      // 请求图片（带防盗链 Referer）
      const response = await fetchRemoteImage(imageUrl, c.env);

      if (!response.ok) {
        return c.json({ error: '无法获取图片' }, 500);
      }

      // 获取图片内容类型
      const contentType = response.headers.get('content-type') || 'image/png';

      // 获取图片数据
      const imageData = await response.arrayBuffer();

      // 构造新的响应
      const newResponse = new Response(imageData, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      });

      return newResponse;
    } catch (error) {
      console.error('代理图片错误:', error);
      return c.json({ error: '代理图片失败: ' + error.message }, 500);
    }
  });

export default app;
